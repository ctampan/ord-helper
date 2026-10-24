import type { SVGProps } from "react";
import {
  ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowUturnLeftIcon, ArrowsPointingOutIcon,
  Bars3BottomLeftIcon, BarsArrowDownIcon, BookOpenIcon, ChartBarIcon,
  ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, EyeIcon, FolderIcon,
  FunnelIcon, HeartIcon, LockClosedIcon, LockOpenIcon, MagnifyingGlassIcon,
  MoonIcon, QuestionMarkCircleIcon, SparklesIcon, Squares2X2Icon, SunIcon,
  TrashIcon, XMarkIcon,
} from "@heroicons/react/20/solid";

// Heroicons has no keyboard glyph; this filled SVG uses the same 20px canvas.
function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M3 4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H3Zm1 3h2v2H4V7Zm3 0h2v2H7V7Zm3 0h2v2h-2V7Zm3 0h3v2h-3V7ZM4 10h2v2H4v-2Zm3 0h2v2H7v-2Zm3 0h2v2h-2v-2Zm3 0h3v2h-3v-2Zm-8 3.5h10V15H5v-1.5Z" />
  </svg>;
}

const icons = {
  ban: LockClosedIcon, unban: LockOpenIcon, keyboard: KeyboardIcon,
  sun: SunIcon, moon: MoonIcon, size: ArrowsPointingOutIcon, tooltip: EyeIcon,
  wisp: SparklesIcon, stats: ChartBarIcon, filter: FunnelIcon,
  groups: FolderIcon, flat: Bars3BottomLeftIcon, sort: BarsArrowDownIcon,
  recipe: BookOpenIcon, export: ArrowDownTrayIcon, import: ArrowUpTrayIcon,
  reset: TrashIcon, help: QuestionMarkCircleIcon, close: XMarkIcon,
  back: ArrowUturnLeftIcon, down: ChevronDownIcon, up: ChevronUpIcon,
  right: ChevronRightIcon, search: MagnifyingGlassIcon, support: HeartIcon,
  collection: Squares2X2Icon,
};

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16, style, ...props }: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
}) {
  const Glyph = icons[name];
  return <Glyph width={size} height={size} aria-hidden="true" focusable="false"
    style={{ flexShrink: 0, verticalAlign: "middle", ...style }} {...props} />;
}
