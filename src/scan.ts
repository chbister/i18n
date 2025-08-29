import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

// Options for the scanning operation.
export type ScanOptions = {
    // Globs to include, e.g. ["app/**\/*.php", "resources/**\/*.blade.php", "resources/**\/*.{js,jsx,ts,tsx,vue}"]
    src: string[];
    // Directory that holds locale JSON files (e.g. "resources/lang")
    localesDir: string;
    // Locales to maintain (e.g. ["en", "de"])
    locales: string[];
    // Locale that receives default values when a key is new (e.g. "en")
    master: string;
    // For non-master locales: "copy" copies the key as value; "empty" leaves an empty string
    placeholder: "copy" | "empty";
    // Do not write files; just print what would happen
    dry?: boolean;
    // Suppress console output
    silent?: boolean;
};

// Simple i18n dictionary map
type LocaleMap = Record<string, string>;

// Patterns to detect calls like __('key'), trans('key'), @lang('key'),
// and template literals without ${} inside.
// NOTE: This intentionally ignores dynamic expressions and multi-line strings.
const CALL_PATTERNS: RegExp[] = [
    /(?:__|trans)\(\s*(['"`])((?:(?!\1|\\).|\\.)+)\1\s*\)/g,
    /@lang\(\s*(['"`])((?:(?!\1|\\).|\\.)+)\1\s*\)/g,
    /(?:__|trans)\(\s*`([^`$]+)`\s*\)/g
];

// Unescape simple sequences like \', \" and \\ inside string literals.
function unescapeString(str: string) {
    return str.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

// Extract translation keys from a source string using the regex patterns above.
function extractKeys(source: string): Set<string> {
    const keys = new Set<string>();
    for (const re of CALL_PATTERNS) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(source)) !== null) {
            const key = (m[2] ?? m[1]) as string;
            if (key && !key.includes("\n")) keys.add(unescapeString(key));
        }
    }
    return keys;
}

// Load a locale JSON file; return empty object if it does not exist.
function loadLocaleFile(localesDir: string, locale: string): LocaleMap {
    const fp = path.join(localesDir, `${locale}.json`);
    if (!fs.existsSync(fp)) return {};
    try {
        const raw = fs.readFileSync(fp, "utf8");
        return raw ? (JSON.parse(raw) as LocaleMap) : {};
    } catch (e: any) {
        throw new Error(`Failed to parse ${fp}: ${e.message}`);
    }
}

// Save a locale JSON file (alphabetically sorted keys).
function saveLocaleFile(localesDir: string, locale: string, obj: LocaleMap, dry?: boolean, silent?: boolean) {
    const fp = path.join(localesDir, `${locale}.json`);
    const sorted = Object.keys(obj).sort().reduce<LocaleMap>((acc, k) => {
        acc[k] = obj[k];
        return acc;
    }, {});
    const out = JSON.stringify(sorted, null, 2) + "\n";
    if (!dry) {
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, out, "utf8");
    }
    if (!silent) console.log(`${dry ? "[DRY] " : ""}wrote: ${fp} (${Object.keys(sorted).length} keys)`);
}

export type ScanResult = {
    filesScanned: number;
    keysFound: number;
    added: number;
    perLocaleCounts: Record<string, number>;
};

// Run the scan: find keys in source files and add missing entries to locale JSONs.
// Existing entries are never overwritten.
export async function runScan(opts: ScanOptions): Promise<ScanResult> {
    const { src, localesDir, locales, master, placeholder, dry, silent } = opts;

    if (!silent) {
        console.log("i18n-scan configuration:");
        console.log("  src:        ", src.join(", "));
        console.log("  localesDir: ", localesDir);
        console.log("  locales:    ", locales.join(", "));
        console.log("  master:     ", master);
        console.log("  placeholder:", placeholder);
        console.log("  dry-run:    ", !!dry, "\n");
    }

    // Collect files
    const files = await fg(src, {
        dot: false,
        onlyFiles: true,
        unique: true,
        ignore: ["**/node_modules/**", "**/vendor/**", "**/dist/**", "**/build/**"]
    });

    if (!silent) console.log(`Scanning ${files.length} file(s)…`);

    // Aggregate keys across all files
    const foundKeys = new Set<string>();
    for (const fp of files) {
        try {
            const content = fs.readFileSync(fp, "utf8");
            const keys = extractKeys(content);
            keys.forEach(k => foundKeys.add(k));
        } catch (e: any) {
            if (!silent) console.warn(`Warning: could not read ${fp} (${e.message}).`);
        }
    }

    if (!silent) console.log(`Found ${foundKeys.size} unique key(s).`);

    // Load existing locale data
    const localeData: Record<string, LocaleMap> = {};
    for (const loc of locales) {
        localeData[loc] = loadLocaleFile(localesDir, loc);
    }

    // Add missing entries without overwriting existing ones
    let addedTotal = 0;
    const perLocaleCounts: Record<string, number> = Object.fromEntries(locales.map(l => [l, 0]));

    for (const key of foundKeys) {
        for (const loc of locales) {
            const dict = localeData[loc];
            if (!(key in dict)) {
                dict[key] = (loc === master) ? key : (placeholder === "copy" ? key : "");
                addedTotal++;
                perLocaleCounts[loc]++;
            }
        }
    }

    if (!silent) console.log(`Added new entries (total across locales): ${addedTotal}`);

    // Persist
    for (const loc of locales) {
        saveLocaleFile(localesDir, loc, localeData[loc], dry, silent);
    }

    return {
        filesScanned: files.length,
        keysFound: foundKeys.size,
        added: addedTotal,
        perLocaleCounts
    };
}
