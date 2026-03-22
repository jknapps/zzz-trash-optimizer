// ZZZ disc set scanner keys in approximate release/in-game order.
// These are AdeptiScanner_ZZZ setKey values (PascalCase).
export const DISC_CHRONO_ORDER = [
    "Woodpecker Electro",
    "Puffer Electro",
    "Shockstar Disco",
    "Freedom Blues",
    "Hormone Punk",
    "Soul Rock",
    "Fanged Metal",
    "Polar Metal",
    "Chaotic Metal",
    "Branch Blade Song",
    "Swing Jazz",
    "Inferno Metal",
    "Thunder Metal",
    "Chaos Jazz",
    "Astral Voice",
    "Dawn's Bloom",
    "Protopunk",
    "Phaethon's Melody",
    "King of the Summit",
    "Shadow Harmony",
    "Moonlight Lullaby",
    "Yunkui Tales",
    "Shining Aria",
    "Whitewater Ballad"
];

function normalizeSetName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getChronoSortIndex(name: string): number {
    const target = normalizeSetName(name);
    const index = DISC_CHRONO_ORDER.findIndex(c => normalizeSetName(c) === target);
    return index === -1 ? 999 : index;
}
