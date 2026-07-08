import { postCallStatusWebhookHandler } from "@/routes/call.routes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return postCallStatusWebhookHandler(request, id);
}
