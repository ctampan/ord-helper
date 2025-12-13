import React, { useState, useEffect } from "react";

// Global cache for image blobs (URL -> ObjectURL)
const imageCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export const CachedImage: React.FC<CachedImageProps> = ({ src, ...props }) => {
  const [cachedSrc, setCachedSrc] = useState<string | null>(
    () => imageCache.get(src) || null
  );
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setCachedSrc(imageCache.get(src) || null);
  }

  useEffect(() => {
    if (!src || imageCache.has(src)) return;

    let isMounted = true;

    const fetchImage = async () => {
      try {
        // Check if there is already a pending request for this URL
        let requestPromise = pendingRequests.get(src);

        if (!requestPromise) {
          requestPromise = fetch(src)
            .then((response) => response.blob())
            .then((blob) => URL.createObjectURL(blob))
            .catch((err) => {
              console.error("Failed to load image", src, err);
              // Fallback to original src on error to let browser handle it (or show broken image)
              return src;
            });

          pendingRequests.set(src, requestPromise);
        }

        const objectUrl = await requestPromise;

        // Cache it
        imageCache.set(src, objectUrl);
        // Clean up pending request
        pendingRequests.delete(src);

        if (isMounted) {
          setCachedSrc(objectUrl);
        }
      } catch (error) {
        console.error("Error caching image:", error);
        if (isMounted) setCachedSrc(src);
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [src]);

  // While loading/caching, standard img might be shown or nothing.
  // Let's show nothing or a placeholder until we have the cached blob to ensure instant swap.
  // Actually, for first load, showing the browser loading process (fallback to src) is fine,
  // but we want to ensure *future* loads use the blob.
  // However, forcing `src` initially might cause a double network request if we aren't careful?
  // If we just wait for the blob, it might delay the first render slightly.
  // Given the requirement is "cache for later", waiting for the blob is safer to guarantee cache usage.

  if (!cachedSrc) {
    // Optional: Render a placeholder or return null
    // For now, let's return a simple transparent placeholder to verify layout size if provided,
    // or just null.
    // To avoid layout shift, if width/height are props, we could render a skeleton.
    // But simpler is to simply render the img with the original 'src' while fetching?
    // If we render with original 'src', browser fetches it. Then we fetch it again via fetch().
    // That is double traffic on first load.
    // Better strictly wait for fetch.
    return (
      <img
        {...props}
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" // Transparent 1x1 pixel
        alt={props.alt || ""}
      />
    );
  }

  return <img {...props} src={cachedSrc} />;
};
