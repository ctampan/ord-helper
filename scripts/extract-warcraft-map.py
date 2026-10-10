"""Read Warcraft object data with the official StormLib DLL (offline, Windows).

The map is opened with STREAM_FLAG_READ_ONLY. Only the requested JSON output is
written; scripts inside the map are never executed. Obtain StormLib separately.
"""
import argparse
import ctypes
import hashlib
import json
import re
import struct
from pathlib import Path


def clean_text(value):
    return re.sub(r"\|c[0-9a-f]{8}|\|r", "", value, flags=re.I).replace("|n", "\n").replace("−", "-")


def parse_objects(raw, extended=False):
    """Preserve every modification, including its level and data pointer."""
    position = 0

    def number(format="<i"):
        nonlocal position
        value = struct.unpack_from(format, raw, position)[0]
        position += 4
        return value

    def raw_id():
        nonlocal position
        value = raw[position:position + 4].decode("latin1")
        position += 4
        return value

    version = number()
    if version != 2:
        raise ValueError(f"Unsupported object format {version}")
    objects = []
    for table in ("original", "custom"):
        count = number()
        if not 0 <= count < 100000:
            raise ValueError("Invalid object count")
        for _ in range(count):
            old_id, new_id = raw_id(), raw_id()
            changes = []
            for _ in range(number()):
                field, kind = raw_id(), number()
                level, pointer = (number(), number()) if extended else (None, None)
                if kind == 0:
                    value = number()
                elif kind in (1, 2):
                    value = number("<f")
                elif kind == 3:
                    end = raw.index(b"\0", position)
                    value = raw[position:end].decode("utf8", errors="replace")
                    position = end + 1
                else:
                    raise ValueError(f"Unsupported value type {kind}")
                terminal = raw_id()
                changes.append({"field": field, "level": level, "dataPointer": pointer,
                                "value": value, "terminalId": terminal})
            objects.append({"id": new_id if table == "custom" else old_id,
                            "baseId": old_id, "table": table, "modifications": changes})
    if position != len(raw):
        raise ValueError(f"Unparsed object data: {len(raw) - position} bytes")
    return objects


class MapArchive:
    def __init__(self, library, map_path):
        handle, uint = ctypes.c_void_p, ctypes.c_uint32
        self.library = ctypes.WinDLL(str(library), use_last_error=True)
        signatures = {
            "SFileOpenArchive": ([ctypes.c_wchar_p, uint, uint, ctypes.POINTER(handle)], ctypes.c_bool),
            "SFileOpenFileEx": ([handle, ctypes.c_char_p, uint, ctypes.POINTER(handle)], ctypes.c_bool),
            "SFileGetFileSize": ([handle, ctypes.POINTER(uint)], uint),
            "SFileReadFile": ([handle, ctypes.c_void_p, uint, ctypes.POINTER(uint), ctypes.c_void_p], ctypes.c_bool),
            "SFileCloseFile": ([handle], ctypes.c_bool),
            "SFileCloseArchive": ([handle], ctypes.c_bool),
        }
        for name, (arguments, result) in signatures.items():
            function = getattr(self.library, name)
            function.argtypes, function.restype = arguments, result
        self.handle = handle()
        if not self.library.SFileOpenArchive(str(map_path.resolve()), 0, 0x100, ctypes.byref(self.handle)):
            raise OSError(ctypes.get_last_error(), "Cannot open map read-only")

    def read(self, name):
        file = ctypes.c_void_p()
        if not self.library.SFileOpenFileEx(self.handle, name.encode(), 0, ctypes.byref(file)):
            raise OSError(ctypes.get_last_error(), f"Cannot open {name}")
        try:
            high = ctypes.c_uint32()
            size = self.library.SFileGetFileSize(file, ctypes.byref(high))
            if high.value or size > 64_000_000:
                raise ValueError("Unexpectedly large map member")
            buffer, count = ctypes.create_string_buffer(size), ctypes.c_uint32()
            if not self.library.SFileReadFile(file, buffer, size, ctypes.byref(count), None):
                raise OSError(ctypes.get_last_error(), f"Cannot read {name}")
            return buffer.raw[:count.value]
        finally:
            self.library.SFileCloseFile(file)

    def close(self):
        self.library.SFileCloseArchive(self.handle)


def extract(map_path, library):
    archive = MapArchive(library, map_path)
    with map_path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    result = {"map": map_path.name, "sha256": digest,
              "files": {}, "unavailable": {}}
    try:
        for name, extended in [("war3map.w3u", False), ("war3map.w3a", True),
                               ("war3map.w3q", True), ("war3map.w3t", False),
                               ("war3map.wts", None), ("war3map.j", None)]:
            try:
                raw = archive.read(name)
                member = {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
                if extended is not None:
                    member["objects"] = parse_objects(raw, extended)
                else:
                    text = raw.decode("utf8", errors="replace")
                    member["strings" if name.endswith(".wts") else "text"] = (
                        dict(re.findall(r"STRING\s+(\d+)\s*\{\s*(.*?)\s*\}", text, re.S))
                        if name.endswith(".wts") else text)
                result["files"][name] = member
            except (OSError, ValueError) as error:
                result["unavailable"][name] = str(error)
    finally:
        archive.close()
    strings = result["files"].get("war3map.wts", {}).get("strings", {})
    for member in result["files"].values():
        for obj in member.get("objects", []):
            for change in obj["modifications"]:
                if isinstance(change["value"], str):
                    value = change["value"]
                    if re.fullmatch(r"TRIGSTR_\d+", value):
                        value = strings.get(str(int(value[8:])), value)
                    change["text"] = clean_text(value)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("map", type=Path)
    parser.add_argument("--library", type=Path, required=True, help="Official x64 Unicode StormLib.dll")
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    result = extract(arguments.map, arguments.library)
    arguments.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"sha256": result["sha256"], "objects": {
        name: len(member["objects"]) for name, member in result["files"].items() if "objects" in member},
        "unavailable": result["unavailable"]}))


if __name__ == "__main__":
    main()
