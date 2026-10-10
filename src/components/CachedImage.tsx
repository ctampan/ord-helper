import type { ImgHTMLAttributes } from "react";

interface CachedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/** Let the browser cache/decode images without retaining duplicate Blob URLs. */
export function CachedImage({ decoding = "async", loading = "lazy", ...props }: CachedImageProps) {
  return <img decoding={decoding} loading={loading} {...props} />;
}
