import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import Settings from "./Settings";

const { useState, useRef } = React;
const { Alert, TextInput, View, Text, StyleSheet } = RN;

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const EditIcon =
    getAssetIDByName("ic_edit_24px") ??
    getAssetIDByName("PencilIcon") ??
    getAssetIDByName("ic_pencil");

function showReplacementPrompt(channelId: string, messageId: string) {
    const RestAPI = findByProps("get", "post", "del", "patch");
    const suppressNotifications: boolean = storage.suppressNotifications ?? true;

    let inputValue = "";

    Alert.prompt(
        "Silent Replace",
        "Enter the replacement message:",
        [
            { text: "Cancel", style: "cancel" },
            {
                text: "Send",
                onPress: async (text?: string) => {
                    const replacementText = (text ?? "").trim() || "** **";
                    try {
                        await RestAPI.post({
                            url: `/channels/${channelId}/messages`,
                            body: {
                                content: replacementText,
                                flags: suppressNotifications ? 4096 : 0,
                                mobile_network_type: "unknown",
                                nonce: messageId,
                                tts: false,
                            },
                        });
                        logger.log("[SilentDelete] Success!");
                    } catch (err) {
                        logger.log("[SilentDelete] Error: " + String(err));
                    }
                },
            },
        ],
        "plain-text",
        "",
    );
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
                    // Self-cleaning patch — removed after sheet unmounts
                    React.useEffect(() => () => { unpatch(); }, []);

                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
                        logger.warn("[SilentDelete] Could not find ActionSheetRowGroups");
                        return;
                    }

                    const silentReplaceButton = React.createElement(ActionSheetRow, {
                        label: "Silent Replace",
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: EditIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            showReplacementPrompt(channelId, messageId);
                        },
                    });

                    // Find the Edit row and insert our button directly below it
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
                            // Insert right after the Edit row
                            groupChildren.splice(editRowIndex + 1, 0, silentReplaceButton);
                            inserted = true;
                            break;
                        }
                    }

                    if (!inserted) {
                        // Fallback: add as own group at the top
                        logger.warn("[SilentDelete] Edit row not found, inserting at top");
                        groups.splice(0, 0,
                            React.createElement(ActionSheetRow.Group, null, silentReplaceButton)
                        );
                    }
                });
            });
        });

        logger.log("[SilentDelete] Loaded.");
    },

    onUnload() {
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
        logger.log("[SilentDelete] Unloaded.");
    },

    settings: Settings,
};
