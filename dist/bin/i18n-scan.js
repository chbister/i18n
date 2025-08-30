#!/usr/bin/env node
import { runScan } from "../scan.js";
/** Tiny CLI arg helper: supports --flag value and --flag=value */
const args = process.argv.slice(2);
const getArg = (name, def) => {
    const idx = args.findIndex(a => a === name || a.startsWith(name + "="));
    if (idx === -1)
        return def;
    const a = args[idx];
    if (a.includes("="))
        return a.split("=").slice(1).join("=");
    const next = args[idx + 1];
    return next && !next.startsWith("--") ? next : true;
};
const help = () => {
    console.log(`
i18n-scan — add missing translation keys to locale JSON files

Usage:
  i18n-scan [options]

Options:
  --src "<globs,comma,sep>"   Globs to scan (default:
                              "app/**/*.php,resources/**/*.php,resources/**/*.blade.php,resources/**/*.{js,jsx,ts,tsx,vue}")
  --localesDir <dir>          Directory of locale JSONs (default: "resources/lang")
  --locales "en,de,..."       Locales to update (default: "en,de")
  --master <locale>           Master locale for default values (default: "en")
  --placeholder <copy|empty>  For non-master locales: copy key as value or leave empty (default: "copy")
  --dry                       Dry-run (do not write files)
  --silent                    Suppress console output
  -h, --help                  Show this help
`);
};
if (args.includes("-h") || args.includes("--help")) {
    help();
    process.exit(0);
}
const SRC = String(getArg("--src", "app/**/*.php,resources/**/*.php,resources/**/*.blade.php,resources/**/*.{js,jsx,ts,tsx,vue}")).split(",").map(s => s.trim());
const LOCALES_DIR = String(getArg("--localesDir", "resources/lang"));
const LOCALES = String(getArg("--locales", "en,de")).split(",").map(s => s.trim());
const MASTER = String(getArg("--master", "en"));
const PLACEHOLDER = String(getArg("--placeholder", "copy"));
const DRY = Boolean(getArg("--dry", false));
const SILENT = Boolean(getArg("--silent", false));
runScan({
    src: SRC,
    localesDir: LOCALES_DIR,
    locales: LOCALES,
    master: MASTER,
    placeholder: PLACEHOLDER,
    dry: DRY,
    silent: SILENT
}).then(res => {
    if (!SILENT) {
        console.log("\nResult:");
        console.log(JSON.stringify(res, null, 2));
    }
}).catch(err => {
    console.error(err);
    process.exit(1);
});
