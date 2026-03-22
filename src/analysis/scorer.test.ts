import { DiscScorer, Disc } from './scorer';
import { CharacterBuild } from '../scraper/prydwen';

describe('DiscScorer', () => {
    const mockDb: CharacterBuild[] = [
        {
            name: "Zhu Yuan",
            bestDiscSets: ["chaoticmetal"],
            statPriority: {
                slot4: ["CRIT Rate", "CRIT DMG"],
                slot5: ["Ether DMG"],
                slot6: ["ATK%"],
                substats: {
                    weight1: ["CRIT Rate", "CRIT DMG", "ATK%"],
                    weight05: ["Anomaly Proficiency"]
                }
            },
            warnings: []
        }
    ];

    const scorer = new DiscScorer(mockDb);

    it('should identify a GOOD disc for Zhu Yuan', () => {
        const goodDisc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "crit_",   // CRIT Rate
            substats: [
                { key: "crit_dmg_", upgrades: 2 },  // 1.0 (CRIT DMG)
                { key: "atk_", upgrades: 3 }         // 1.0 (ATK%)
            ],
            rarity: 'S',
            level: 0
        };

        const result = scorer.scoreDisc(goodDisc);
        expect(result.isKeep).toBe(true);
        expect(result.bestCharacter).toBe("Zhu Yuan");
        expect(result.matchCount).toBe(2.0);
    });

    it('should trash a disc with wrong main stat', () => {
        const trashDisc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "hp_",  // HP% — not recommended for slot 4 on Zhu Yuan
            substats: [
                { key: "crit_", upgrades: 2 },
                { key: "crit_dmg_", upgrades: 2 }
            ],
            rarity: 'S',
            level: 0
        };

        const result = scorer.scoreDisc(trashDisc);
        expect(result.isKeep).toBe(false);
    });

    it('should keep CRIT Rate slot-4 disc with lower threshold (critical main stat)', () => {
        const critDisc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "crit_",  // CRIT Rate — triggers critical main stat protection
            substats: [
                { key: "atk_", upgrades: 1 }  // 1.0 (ATK%)
            ],
            rarity: 'S',
            level: 0
        };

        const result = scorer.scoreDisc(critDisc);
        expect(result.isKeep).toBe(true);
        expect(result.matchCount).toBe(1.0);
    });

    it('should match guide ATK% recommendation to inventory atk_ on variable slots', () => {
        const atkDisc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "6",
            mainStatKey: "atk_",  // ATK%
            substats: [
                { key: "crit_", upgrades: 2 },
                { key: "crit_dmg_", upgrades: 2 }
            ],
            rarity: 'S',
            level: 0
        };

        const result = scorer.scoreDisc(atkDisc);
        expect(result.isKeep).toBe(true);
        expect(result.bestCharacter).toBe("Zhu Yuan");
    });

    it('should ignore non-S-rarity discs', () => {
        const aRankDisc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "crit_",
            substats: [
                { key: "crit_dmg_", upgrades: 2 },
                { key: "atk_", upgrades: 2 }
            ],
            rarity: 'A',
            level: 0
        };

        const result = scorer.scoreDisc(aRankDisc);
        expect(result.isKeep).toBe(false);
        expect(result.matchCount).toBe(0);
    });

    it('should trash a tight build disc under STRICT policy', () => {
        const strictScorer = new DiscScorer(mockDb, { policy: 'strict' });
        const disc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "crit_",  // CRIT Rate
            substats: [
                { key: "atk_", upgrades: 1 }  // 1.0
            ],
            rarity: 'S',
            level: 0
        };
        const res = strictScorer.scoreDisc(disc);
        expect(res.isKeep).toBe(false);  // Strict requires 2.0
    });

    it('should keep a tight build disc under CONSERVATIVE policy', () => {
        const tightDb: CharacterBuild[] = [{
            name: "Tight Char",
            bestDiscSets: ["chaoticmetal"],
            statPriority: {
                slot4: ["HP%"],
                slot5: ["Elemental DMG"],
                slot6: ["ATK%"],
                substats: {
                    weight1: ["CRIT Rate"],  // Only 1 Tier-1 stat!
                    weight05: []
                }
            },
            warnings: []
        }];
        const conservativeScorer = new DiscScorer(tightDb, { policy: 'conservative' });
        const disc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "hp_",  // HP%
            substats: [{ key: "crit_", upgrades: 2 }],  // Score 1.0
            rarity: 'S',
            level: 0
        };
        const res = conservativeScorer.scoreDisc(disc);
        expect(res.isKeep).toBe(true);  // Threshold lowered to 1.0 for tight build
    });

    it('should not lower threshold when tier-0.5 fallback keeps build above 2.0', () => {
        const fallbackSafeDb: CharacterBuild[] = [{
            name: "Fallback Safe",
            bestDiscSets: ["chaoticmetal"],
            statPriority: {
                slot4: ["HP%"],
                slot5: ["Elemental DMG"],
                slot6: ["ATK%"],
                substats: {
                    weight1: ["CRIT Rate", "CRIT DMG", "ATK%"],
                    weight05: ["Anomaly Proficiency", "PEN"]
                }
            },
            warnings: []
        }];

        const conservativeScorer = new DiscScorer(fallbackSafeDb, { policy: 'conservative' });
        const disc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "4",
            mainStatKey: "hp_",  // HP%
            substats: [{ key: "crit_", upgrades: 2 }, { key: "anomProf", upgrades: 1 }],  // 1.0 + 0.5 = 1.5
            rarity: 'S',
            level: 0
        };

        const res = conservativeScorer.scoreDisc(disc);
        expect(res.isKeep).toBe(false);
    });

    it('should handle fixed-slot exclusions (slot 1 excludes flat HP substat)', () => {
        const headHPDb: CharacterBuild[] = [{
            name: "Head HP Char",
            bestDiscSets: ["chaoticmetal"],
            statPriority: {
                slot4: ["DEF%"],
                slot5: ["Elemental DMG"],
                slot6: ["ATK%"],
                substats: {
                    weight1: ["HP", "CRIT Rate"],  // Wants flat HP but it's forbidden on slot 1!
                    weight05: []
                }
            },
            warnings: []
        }];
        const conservativeScorer = new DiscScorer(headHPDb, { policy: 'conservative' });
        const disc: Disc = {
            setKey: "ChaoticMetal",
            slotKey: "1",
            mainStatKey: "hp",
            substats: [{ key: "crit_", upgrades: 2 }],  // Score 1.0. Max possible is 1.0 (HP excluded).
            rarity: 'S',
            level: 0
        };
        const res = conservativeScorer.scoreDisc(disc);
        // maxPossible for slot 1 is 1.0 because flat HP sub is forbidden.
        // tight build → threshold = 1.0
        expect(res.isKeep).toBe(true);
    });
});
