import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import Settings from "./Settings";

const { useState } = React;
const { TextInput, StyleSheet } = RN;

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
const AlertActions = findByProps("openAlert", "dismissAlert");
const { AlertModal, AlertActionButton } = findByProps("AlertModal", "AlertActionButton");

const EditIcon =
    getAssetIDByName("ic_edit_24px") ??
    getAssetIDByName("PencilIcon") ??
    getAssetIDByName("ic_pencil");

const styles = StyleSheet.create({
    input: {
        backgroundColor: "#2b2d31",
        color: "#ffffff",
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        borderWidth: 1,
        borderColor: "#3f4147",
        marginTop: 8,
    },
});

async function sendReplacement(channelId: string, messageId: string, replacementText: string) {
    const RestAPI = findByProps("get", "post", "del", "patch");
    const suppressNotifications: boolean = storage.suppressNotifications ?? true;
    try {
        await RestAPI.post({
            url: `/channels/${channelId}/messages`,
            body: {
                content: replacementText.trim() || "** **",
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

function ReplacementInput({ onChangeText }: { onChangeText: (t: string) => void }) {
    const [text, setText] = useState("");
    return (
        <TextInput
            style={styles.input}
            placeholder="Enter replacement message..."
            placeholderTextColor="#6d6f78"
            autoFocus={true}
            onChangeText={(t: string) => {
                setText(t);
                onChangeText(t);
            }}
        />
    );
}

function openReplaceAlert(channelId: string, messageId: string) {
    let currentText = "";

    AlertActions.openAlert(
        "silent-edit-replace",
        React.createElement(
            AlertModal,
            {
                title: "Silent Replace",
                content: "Enter the message that will replace this one.",
                extraContent: React.createElement(ReplacementInput, {
                    onChangeText: (t: string) => { currentText = t; },
                }),
                actions: React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(AlertActionButton, {
                        text: "Send",
                        variant: "primary",
                        onPress: () => {
                            AlertActions.dismissAlert("silent-edit-replace");
                            sendReplacement(channelId, messageId, currentText);
                        },
                    }),
                    React.createElement(AlertActionButton, {
                        text: "Cancel",
                        variant: "secondary",
                        onPress: () => AlertActions.dismissAlert("silent-edit-replace"),
                    }),
                ),
            }
        )
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
                            setTimeout(() => openReplaceAlert(channelId, messageId), 350);
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
