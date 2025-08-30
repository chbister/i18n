export type ScanOptions = {
    src: string[];
    localesDir: string;
    locales: string[];
    master: string;
    placeholder: "copy" | "empty";
    dry?: boolean;
    silent?: boolean;
};
export type ScanResult = {
    filesScanned: number;
    keysFound: number;
    added: number;
    perLocaleCounts: Record<string, number>;
};
export declare function runScan(opts: ScanOptions): Promise<ScanResult>;
