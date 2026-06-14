import { storage } from "@vendetta/plugin";

const STREAMABLE_API = "https://api.streamable.com";

export interface StreamableResponse {
    shortcode: string;
    status: number;
    url?: string;
}

export async function uploadToStreamable(file: any): Promise<string | null> {
    try {
        const filename = file?.filename ?? "video.mp4";
        const uri = file?.uri ?? file?.path;

        if (!uri) throw new Error("No file URI found");

        const formData = new FormData();
        formData.append("file", {
            uri,
            name: filename,
            type: file?.mimeType ?? "video/mp4",
        } as any);

        const headers: Record<string, string> = {
            "Accept": "application/json",
        };

        // Use basic auth if credentials are provided
        const username = storage.streamableUsername?.trim();
        const password = storage.streamablePassword?.trim();
        if (username && password) {
            const encoded = btoa(`${username}:${password}`);
            headers["Authorization"] = `Basic ${encoded}`;
        }

        const response = await fetch(`${STREAMABLE_API}/upload`, {
            method: "POST",
            headers,
            body: formData,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Streamable error ${response.status}: ${text}`);
        }

        const data: StreamableResponse = await response.json();

        if (!data.shortcode) throw new Error("No shortcode in response");

        // Poll until video is ready (status 2 = ready)
        const link = `https://streamable.com/${data.shortcode}`;
        return link;
    } catch (err) {
        console.error("[VidShare] Streamable upload error:", err);
        return null;
    }
}
