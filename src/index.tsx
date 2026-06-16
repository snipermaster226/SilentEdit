import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import Settings from "./Settings";

const { useState } = React;
const { View, Text, TextInput, TouchableOpacity, StyleSheet } = RN;

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
// Discord's own modal system — same one used internally
const NavigationActions = findByProps("openModal", "pushLazy");

const EditIcon =
    getAssetIDByName("ic_edit_24px") ??
    getAssetIDByName("PencilIcon") ??
    getAssetIDByName("ic_pencil");

const styles = StyleSheet.create({
    container: {
        padding: 20,
        paddingBottom: 36,
    },
    title: {
        color: "#ffffff",
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 14,
        textAlign: "center",
    },
    input: {
        backgroundColor: "#2b2d31",
        color: "#ffffff",
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: "#3f4147",
    },
    buttonRow: {
        flexDirection: "row",
        gap: 10,
    },
    cancelBtn: {
        flex: 1,
        backgroundColor: "#2b2d31",
        borderRadius: 8,
        paddingVertical: 13,
        alignItems: "center",
    },
    cancelText: {
        color: "#b5bac1",
        fontSize: 15,
        fontWeight: "600",
    },
    sendBtn: {
        flex: 1,
        backgroundColor: "#5865f2",
        borderRadius: 8,
        paddingVertical: 13,
        alignItems: "center",
    },
    sendText: {
        color: "#ffffff",
        fontSize: 15,
        fontWeight: "600",
    },
});

function SilentReplaceSheet({ onClose, channelId, messageId }: {
    onClose: () => void;
    channelId: string;
    messageId: string;
}) {
    const [text, setText] = useState("");

    const handleSend = async () => {
        onClose();
        const RestAPI = findByProps("get", "post", "del", "patch");
        const suppressNotifications: boolean = storage.suppressNotifications ?? true;
        const replacementText = text.trim() || "** **";
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
            logger.log("[SilentEdit] Success!");
        } catch (err) {
            logger.log("[SilentEdit] Error: " + String(err));
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Silent Replace</Text>
            <TextInput
                style={styles.input}
                placeholder="Enter replacement message..."
                placeholderTextColor="#6d6f78"
                value={text}
                onChangeText={setText}
                autoFocus={true}
                returnKeyType="send"
                onSubmitEditing={handleSend}
            />
            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                    <Text style={styles.sendText}>Send</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function openReplaceModal(channelId: string, messageId: string) {
    NavigationActions.openModal((props: any) =>
        React.createElement(SilentReplaceSheet, {
            onClose: props.onClose,
            channelId,
            messageId,
        })
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
                            setTimeout(() => openReplaceModal(channelId, messageId), 350);
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
