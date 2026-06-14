import { findByProps } from "@vendetta/metro";

// Video MIME types to intercept
const VIDEO_MIME_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "video/mkv",
    "video/x-matroska",
    "video/3gpp",
    "video/mpeg",
];

export function isVideo(file: any): boolean {
    const mimeType = file?.mimeType ?? file?.type ?? "";
    const filename = file?.filename ?? file?.name ?? "";

    if (VIDEO_MIME_TYPES.includes(mimeType.toLowerCase())) return true;

    // Fallback: check file extension
    const ext = filename.split(".").pop()?.toLowerCase();
    return ["mp4", "mov", "avi", "webm", "mkv", "3gp", "mpeg", "mpg"].includes(ext ?? "");
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Get the file size limit for the current channel based on boost level
export function getFileSizeLimit(channelId: string): number {
    try {
        const ChannelStore = findByProps("getChannel");
        const GuildStore = findByProps("getGuild");

        const channel = ChannelStore?.getChannel?.(channelId);

        // DMs / no guild — base limit
        if (!channel?.guild_id) return 10 * 1024 * 1024;

        const guild = GuildStore?.getGuild?.(channel.guild_id);
        const premiumTier = guild?.premiumTier ?? 0;

        switch (premiumTier) {
            case 3: return 100 * 1024 * 1024;  // Level 3: 100MB
            case 2: return 50 * 1024 * 1024;   // Level 2: 50MB
            default: return 10 * 1024 * 1024;  // Level 0/1: 10MB
        }
    } catch {
        return 10 * 1024 * 1024; // fallback to 10MB
    }
}
