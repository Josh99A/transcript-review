export default function MediaPlayer({ jobId, mediaType }: { jobId: string; mediaType: string }) {
  const src = `/api/media/${jobId}`;
  return mediaType.startsWith("video") ? (
    <video src={src} controls preload="metadata" className="max-h-[26rem] w-full rounded-md bg-black" />
  ) : (
    <audio src={src} controls preload="metadata" className="w-full" />
  );
}
