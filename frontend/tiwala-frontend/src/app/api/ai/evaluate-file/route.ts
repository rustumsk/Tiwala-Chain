import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data request body." },
        { status: 400 }
      );
    }

    const upstream = await fetch("http://localhost:8000/evaluate/file", {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      // Pass-through body avoids expensive parse/rebuild of large files.
      body: request.body,
      // Node fetch requires duplex when forwarding a stream body.
      // @ts-expect-error runtime supports this field.
      duplex: "half",
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

    const payload = await upstream.json();
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
