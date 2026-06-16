import { React } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { FormSwitchRow, FormSection, FormDivider } = Forms;

export default function SilentDeleteSettings() {
    useProxy(storage);

    storage.suppressNotifications ??= true;

    return (
        <>
            <FormSection title="Behavior">
                <FormSwitchRow
                    label="Suppress Notifications"
                    subLabel="Prevents pinging mentioned users when replacing the message."
                    value={!!storage.suppressNotifications}
                    onValueChange={(v: boolean) => (storage.suppressNotifications = v)}
                />
            </FormSection>
        </>
    );
}

