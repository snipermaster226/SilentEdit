import { findByProps } from "@vendetta/metro";
import { ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";

import { uploadToStreamable } from "./api/streamable";
import { isVideo, formatBytes, getFileSizeLimit } from "./lib/utils";

const CloudUpload = findByProps("CloudUpload")?.CloudUpload;
const MessageSender = findByProps("sendMessage");
const ChannelStore = findByProps("getChannelId");
const PendingMessages = findByProps("getPendingMessages", "deletePendingMessage");

export function ensureDefaultSettings() {
    storage.sendToChat ??= true;
    storage.copyToClipboard ??= false;
    storage.streamableUsername ??= "";
    storage.streamablePassword ??= "";
    storage.privateUpload ??= false;
}

function cleanup(channelId: string) {
    try {
        const pending = PendingMessages?.getPendingMessages?.(channelId);
        if (!pending) return;
        for (const [messageId, message] of Object.entries(pending) as any) {
            if (message.state === "FAILED") {
                PendingMessages.deletePendingMessage(channelId, messageId);
            }
        }
    } catch (err) {
        console.warn("[VidShare] Failed to clean pending messages:", err);
    }
}

export function patchUploader(): () => void {
    if (!CloudUpload) {
        console.warn("[VidShare] CloudUpload not found!");
        return () => {};
    }

    const originalUpload = CloudUpload.prototype.reactNativeCompressAndExtractData;

    CloudUpload.prototype.reactNativeCompressAndExtractData = async function (...args: any[]) {
        const file = this;
        const size = file?.preCompressionSize ?? 0;
        const channelId = file?.channelId ?? ChannelStore?.getChannelId?.();

        // Only intercept video files
        if (!isVideo(file)) {
            return originalUpload.apply(this, args);
        }

        // Check if over the server's file size limit
        const limit = getFileSizeLimit(channelId);
        if (size <= limit) {
            return originalUpload.apply(this, args);
        }

        const readableSize = formatBytes(size);
        const readableLimit = formatBytes(limit);

        showToast(`📤 Video too large (${readableSize} > ${readableLimit}), uploading to Streamable...`);

        // Cancel original upload silently
        if (typeof this.setStatus === "function") this.setStatus("CANCELED");
        if (channelId) setTimeout(() => cleanup(channelId), 500);

        try {
            const link = await uploadToStreamable(file);

            if (!link) {
                showToast("❌ Streamable upload failed.");
                return null;
            }

            // Handle based on user preference
            const sendToChat = !!storage.sendToChat;
            const copyToClipboard = !!storage.copyToClipboard;

            if (copyToClipboard) {
                ReactNative.Clipboard.setString(link);
                showToast("✅ Uploaded! Link copied to clipboard.");
            }

            if (sendToChat && channelId && MessageSender?.sendMessage) {
                await MessageSender.sendMessage(channelId, { content: link });
                if (!copyToClipboard) showToast("✅ Uploaded! Link sent to chat.");
            }

            if (!sendToChat && !copyToClipboard) {
                // Fallback — copy even if both disabled
                ReactNative.Clipboard.setString(link);
                showToast("✅ Uploaded! Link copied to clipboard.");
            }

        } catch (err) {
            console.error("[VidShare] Upload error:", err);
            showToast("❌ Upload error occurred.");
            if (channelId) setTimeout(() => cleanup(channelId), 500);
        }

        return null;
    };

    return () => {
        CloudUpload.prototype.reactNativeCompressAndExtractData = originalUpload;
    };
}
