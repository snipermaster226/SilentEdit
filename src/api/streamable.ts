import { storage } from "@vendetta/plugin";

const STREAMABLE_API = "https://api.streamable.com";

export async function uploadToStreamable(file: any): Promise<string | null> {
    try {
        const filename = file?.filename ?? "video.mp4";
        const uri = file?.uri ?? file?.path ?? file?.fileUri;

        if (!uri) throw new Error("No file URI found");

        console.log("[VidShare] Uploading to Streamable:", filename, uri);

        const formData = new FormData();
        formData.append("file", {
            uri,
            name: filename,
            type: file?.mimeType ?? file?.type ?? "video/mp4",
        } as any);

        const headers: Record<string, string> = {};

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

        const text = await response.text();
        console.log("[VidShare] Streamable response:", response.status, text);

        if (!response.ok) throw new Error(`Streamable ${response.status}: ${text}`);

        const data = JSON.parse(text);
        if (!data.shortcode) throw new Error("No shortcode in response");

        return `https://streamable.com/${data.shortcode}`;
    } catch (err) {
        console.error("[VidShare] Streamable upload error:", err);
        return null;
    }
}
