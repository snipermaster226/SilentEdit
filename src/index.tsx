import { ensureDefaultSettings, patchUploader } from "./handler";
import Settings from "./pages/settings";

let unpatches: (() => void)[] = [];

export default {
    onLoad() {
        ensureDefaultSettings();
        unpatches.push(patchUploader());
        console.log("[VidShare] Plugin loaded.");
        this.settings = Settings;
    },

    onUnload() {
        unpatches.forEach((u) => u());
        unpatches = [];
        console.log("[VidShare] Plugin unloaded.");
    },

    settings: Settings,
};
