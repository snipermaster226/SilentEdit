import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import Settings from "./Settings";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const EditIcon =
    getAssetIDByName("ic_edit_24px") ??
    getAssetIDByName("PencilIcon") ??
    getAssetIDByName("ic_pencil");

async function sendReplacement(channelId: string, messageId: string, replacementText: string) {
    const RestAPI = findByProps("get", "post", "del", "patch");
    const suppressNotifications: boolean = storage.suppressNotifications ?? true;
    try {
        await RestAPI.post({
            url: `/channels/${channelId}/messages`,
            body: {
                content: replacementText || "** **",
                flags: suppressNotifications ? 4096 : 0,
                mobile_network_type: "unknown",
                nonce: messageId,
                tts: false,
            },
        });
        logger.log("[SilentEdit] Success!");
    } catch (err) {
        logger.log("[SilentEdit] Error: " + String(err));
    }
}

function openTextInputSheet(channelId: string, messageId: string) {
    // Try Discord's built-in TextInputSheet / CustomTextInputActionSheet
    const TextInputSheet = findByProps("TextInputActionSheet")
        ?? findByProps("CustomTextInputActionSheet");

    if (TextInputSheet) {
        const SheetComp = TextInputSheet.TextInputActionSheet
            ?? TextInputSheet.CustomTextInputActionSheet;

        ActionSheet.openLazy(
            Promise.resolve({ default: SheetComp }),
            "TextInputActionSheet",
            {
                title: "Silent Replace",
                placeholder: "Enter replacement message...",
                submitLabel: "Send",
                onSubmit: (text: string) => {
                    ActionSheet.hideActionSheet();
                    sendReplacement(channelId, messageId, text);
                },
                onCancel: () => ActionSheet.hideActionSheet(),
            }
        );
        return;
    }

    // Fallback: use Discord's UserNoteSheet or similar text sheet
    const UserNote = findByProps("openUserNoteSheet");
    if (UserNote) {
        logger.warn("[SilentEdit] TextInputActionSheet not found, trying fallback");
    }

    // Last resort fallback: use Clipboard + confirmation
    const { Alert } = require("react-native");
    const Clipboard = findByProps("setString", "getString");

    // Open a simple confirm that tells user to paste
    const SimpleAlert = findByProps("showSimpleTextInputAlert")
        ?? findByProps("openAlert");

    if (SimpleAlert?.showSimpleTextInputAlert) {
        SimpleAlert.showSimpleTextInputAlert({
            title: "Silent Replace",
            placeholder: "Enter replacement message...",
            confirmText: "Send",
            confirmColor: "green",
            onConfirm: (text: string) => sendReplacement(channelId, messageId, text),
        });
        return;
    }

    // Absolute last resort
    logger.warn("[SilentEdit] No text input method found");
}

let unpatchOpenLazy: (() => void) | null = null;

export default {
    onLoad() {
        storage.suppressNotifications ??= true;

        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const UserStore = findByProps("getCurrentUser");
            const currentUser = UserStore?.getCurrentUser();
            if (!currentUser || msg.message.author?.id !== currentUser.id) return;

            const channelId: string = msg.message.channel_id;
            const messageId: string = msg.message.id;

            comp.then((instance: any) => {
                const unpatch = after("default", instance, (_: any, component: any) => {
                    React.useEffect(() => () => { unpatch(); }, []);

                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
                        logger.warn("[SilentEdit] Could not find ActionSheetRowGroups");
                        return;
                    }

                    const silentReplaceButton = React.createElement(ActionSheetRow, {
                        label: "Silent Replace",
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: EditIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            setTimeout(() => openTextInputSheet(channelId, messageId), 400);
                        },
                    });

                    let inserted = false;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren: any[] = findInReactTree(
                            groups[gi],
                            (c: any) => Array.isArray(c) && c.some((child: any) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        if (!groupChildren) continue;

                        const editRowIndex = groupChildren.findIndex((c: any) =>
                            c?.props?.label?.toLowerCase?.()?.includes?.("edit") ||
                            c?.props?.message?.toLowerCase?.()?.includes?.("edit")
                        );

                        if (editRowIndex >= 0) {
                            groupChildren.splice(editRowIndex + 1, 0, silentReplaceButton);
                            inserted = true;
                            break;
                        }
                    }

                    if (!inserted) {
                        logger.warn("[SilentEdit] Edit row not found, inserting at top");
                        groups.splice(0, 0,
                            React.createElement(ActionSheetRow.Group, null, silentReplaceButton)
                        );
                    }
                });
            });
        });

        logger.log("[SilentEdit] Loaded.");
    },

    onUnload() {
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
        logger.log("[SilentEdit] Unloaded.");
    },

    settings: Settings,
};
