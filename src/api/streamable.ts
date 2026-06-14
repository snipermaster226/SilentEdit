import { storage } from "@vendetta/plugin";

export async function uploadToStreamable(file: any): Promise<string | null> {
    try {
        const fileUri =
            file?.item?.originalUri ||
            file?.uri ||
            file?.fileUri ||
            file?.path ||
            file?.sourceURL;

        if (!fileUri) throw new Error("Missing file URI");

        const filename = file?.filename ?? "video.mp4";
        const mimeType = file?.mimeType ?? "video/mp4";

        const formData = new FormData();
        formData.append("file", {
            uri: fileUri,
            name: filename,
            type: mimeType,
        } as any);

        const headers: Record<string, string> = {};
        const username = storage.streamableUsername?.trim();
        const password = storage.streamablePassword?.trim();
        if (username && password) {
            headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
        }

        const response = await fetch("https://api.streamable.com/upload", {
            method: "POST",
            headers,
            body: formData,
        });

        const text = await response.text();
        if (!response.ok) throw new Error(`Streamable ${response.status}: ${text}`);

        const data = JSON.parse(text);
        if (!data.shortcode) throw new Error("No shortcode");

        return `https://streamable.com/${data.shortcode}`;
    } catch (err) {
        console.error("[VidShare] Upload error:", err);
        return null;
    }
}
