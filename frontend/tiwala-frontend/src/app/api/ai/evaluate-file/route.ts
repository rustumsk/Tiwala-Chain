import { NextResponse } from "next/server";

const resolvedAiServiceBaseUrl = process.env.AI_SERVICE_BASE_URL?.replace(/\/+$/, "");
const AI_SERVICE_BASE_URL =
  resolvedAiServiceBaseUrl ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    if (!AI_SERVICE_BASE_URL) {
      return NextResponse.json(
        { error: "Missing required env: AI_SERVICE_BASE_URL" },
        { status: 500 }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data request body." },
        { status: 400 }
      );
    }

    const incomingFormData = await request.formData();
    const file = incomingFormData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required file upload." },
        { status: 400 }
      );
    }

    const upstreamFormData = new FormData();
    upstreamFormData.set("file", file, file.name);

    const upstream = await fetch(`${AI_SERVICE_BASE_URL}/evaluate/file`, {
      method: "POST",
      body: upstreamFormData,
      cache: "no-store",
    });

    const upstreamContentType = upstream.headers.get("content-type") ?? "";
    if (!upstreamContentType.includes("application/json")) {
      const text = await upstream.text();
      const response = NextResponse.json(
        { error: "AI service returned non-JSON response.", detail: text },
        { status: upstream.status || 502 }
      );
      response.headers.set("x-proxy-elapsed-ms", String(Date.now() - startedAt));
      return response;
    }

    const payload = (await upstream.json()) as { detail?: string; error?: string } & Record<string, unknown>;
    if (!upstream.ok) {
      const response = NextResponse.json(
        {
          error:
            payload.detail ??
            payload.error ??
            `AI service request failed (${upstream.status}).`,
        },
        { status: upstream.status || 502 }
      );
      response.headers.set("x-proxy-elapsed-ms", String(Date.now() - startedAt));
      return response;
    }

    const response = NextResponse.json(payload, { status: upstream.status });
    response.headers.set("x-proxy-elapsed-ms", String(Date.now() - startedAt));
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected proxy error.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set("x-proxy-elapsed-ms", String(Date.now() - startedAt));
    return response;
  }
}
