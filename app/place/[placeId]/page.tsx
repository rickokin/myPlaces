import PlaceDetailClient from "./place-detail-client";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  return <PlaceDetailClient placeId={placeId} />;
}
