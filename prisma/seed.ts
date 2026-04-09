import {
  CampaignStatus,
  EncounterDifficulty,
  HoldingScope,
  LedgerEntryType,
  LootKind,
  LootRarity,
  MonsterSourceType,
  NpcType,
  PrismaClient,
} from "@prisma/client";
import { hashPin } from "../src/lib/pin";

const prisma = new PrismaClient();

async function main() {
  await prisma.inventoryLedgerEntry.deleteMany();
  await prisma.encounterMonster.deleteMany();
  await prisma.encounter.deleteMany();
  await prisma.lootItem.deleteMany();
  await prisma.bankAccess.deleteMany();
  await prisma.character.deleteMany();
  await prisma.npc.deleteMany();
  await prisma.monsterCompendiumEntry.deleteMany();
  await prisma.campaign.deleteMany();

  const highcrest = await prisma.campaign.create({
    data: {
      slug: "ashes-of-highcrest",
      name: "Ashes of Highcrest",
      status: CampaignStatus.ACTIVE,
      setting: "Storm-battered city intrigue and catacomb delves",
      summary:
        "A recovering port city where noble factions, grave cults, and old flood tunnels keep colliding.",
      sessionNight: "Thursday",
    },
  });

  const sunkenCrown = await prisma.campaign.create({
    data: {
      slug: "sunken-crown",
      name: "The Sunken Crown",
      status: CampaignStatus.ACTIVE,
      setting: "Jungle ruins, flooded vaults, and expedition politics",
      summary:
        "An expedition race into drowned ruins where relics, beasts, and rival crews all want the same map.",
      sessionNight: "Sunday",
    },
  });

  const miri = await prisma.character.create({
    data: {
      campaignId: highcrest.id,
      name: "Miri Vale",
      classRole: "Rogue / Scout",
      level: 5,
      playerName: "Jules",
      notes: "Keeps sensitive evidence in the city vault instead of on her person.",
    },
  });

  const toren = await prisma.character.create({
    data: {
      campaignId: highcrest.id,
      name: "Toren Ash",
      classRole: "Cleric / Frontline",
      level: 5,
      playerName: "Sam",
      notes: "Handles party coin distribution and shrine debts.",
    },
  });

  const sella = await prisma.character.create({
    data: {
      campaignId: sunkenCrown.id,
      name: "Sella Drift",
      classRole: "Druid / Explorer",
      level: 4,
      playerName: "Mina",
      notes: "Stores reagents and delicate relics between expeditions.",
    },
  });

  await prisma.bankAccess.createMany({
    data: [
      {
        characterId: miri.id,
        pinHash: hashPin("2413"),
      },
      {
        characterId: toren.id,
        pinHash: hashPin("4821"),
      },
      {
        characterId: sella.id,
        pinHash: hashPin("9134"),
      },
    ],
  });

  await prisma.npc.createMany({
    data: [
      {
        campaignId: highcrest.id,
        name: "Marrow Venn",
        title: "Undercroft Broker",
        type: NpcType.STANDARD,
        tags: "broker, secrets, undercity",
        surfaceBlurb:
          "Soft-spoken fixer who always knows which tunnel collapsed last night.",
        tableHooks: "Always counts favors on gloved fingers before speaking.",
        persistentNotes:
          "Secretly paying the grave cult for protection after his daughter vanished in the crypt quarter.",
        faction: "Undercroft Exchange",
        relationshipNotes: "Useful contact for rumor acquisition, dangerous if cornered.",
      },
      {
        campaignId: highcrest.id,
        name: "Brass",
        title: "Clockwork Mastiff",
        type: NpcType.COMPANION,
        tags: "companion, construct, tracker",
        surfaceBlurb:
          "Tin-and-brass hound with an eager tail spring and a nose for alchemy.",
        tableHooks: "Taps twice before growling at hidden danger.",
        persistentNotes:
          "Needs wound-up key maintenance every third long rest or its accuracy suffers.",
        faction: "Party asset",
        relationshipNotes: "Bonded to Miri, suspicious of necromancy.",
      },
      {
        campaignId: sunkenCrown.id,
        name: "Captain Ori Pell",
        title: "Expedition Rival",
        type: NpcType.STANDARD,
        tags: "captain, rival, relics",
        surfaceBlurb:
          "Charming river captain who treats every negotiation like a race she intends to win.",
        tableHooks: "Leaves carved shell tokens behind after meetings.",
        persistentNotes:
          "Will cooperate against monstrous threats but steals route intel whenever possible.",
        faction: "Pell Expedition Company",
        relationshipNotes: "Potential ally for one session, antagonist the next.",
      },
    ],
  });

  const [goblin, skeleton, ogre, gelatinousCube, reefStalker] =
    await Promise.all([
      prisma.monsterCompendiumEntry.create({
        data: {
          name: "Goblin Ambusher",
          challengeRating: "1/4",
          monsterType: "Humanoid",
          environment: "Ruins, alleyways, tunnels",
          tags: "ambush, stealth, ranged",
          specialDrops: "Scavenged charms, gutter maps",
          source: MonsterSourceType.SRD,
          notes: "Good low-level pressure unit for flanking and harassment.",
        },
      }),
      prisma.monsterCompendiumEntry.create({
        data: {
          name: "Crypt Skeleton",
          challengeRating: "1/4",
          monsterType: "Undead",
          environment: "Crypts, shrines, ossuaries",
          tags: "undead, attrition, shrine",
          specialDrops: "Bone ward icons, rusted reliquary keys",
          source: MonsterSourceType.SRD,
          notes: "Useful for shrine defense and attrition encounters.",
        },
      }),
      prisma.monsterCompendiumEntry.create({
        data: {
          name: "Tunnel Ogre",
          challengeRating: "2",
          monsterType: "Giant",
          environment: "Collapsed tunnels, sewers, ruins",
          tags: "brute, cave-in, heavy hit",
          specialDrops: "Chain hooks, brute trophies",
          source: MonsterSourceType.OPEN,
          notes: "Frontline bruiser that pairs well with skirmishers.",
        },
      }),
      prisma.monsterCompendiumEntry.create({
        data: {
          name: "Gelatinous Cube",
          challengeRating: "2",
          monsterType: "Ooze",
          environment: "Vault halls, dungeons",
          tags: "ooze, corridor, control",
          specialDrops: "Dissolved trinkets, preserved keys",
          source: MonsterSourceType.SRD,
          notes: "Good for corridor hazards and treasure recovery.",
        },
      }),
      prisma.monsterCompendiumEntry.create({
        data: {
          campaignId: sunkenCrown.id,
          name: "Reef Stalker",
          challengeRating: "3",
          monsterType: "Monstrosity",
          environment: "Flooded ruins, mangrove pools",
          tags: "custom, aquatic, pounce",
          specialDrops: "Pearl glands, tideglass plates",
          source: MonsterSourceType.CUSTOM,
          isCustom: true,
          basedOnName: "Crocodile",
          notes: "Custom monster derived for the Sunken Crown estuary arc.",
        },
      }),
    ]);

  const [wardKey, emberBand, surveyMap] = await Promise.all([
    prisma.lootItem.create({
      data: {
        campaignId: highcrest.id,
        name: "Ward-Key Ring",
        rarity: LootRarity.UNCOMMON,
        kind: LootKind.WONDROUS,
        description:
          "A ring of iron keys that hum near sealed catacomb doors and warded coffers.",
        sourceTag: "crypt caches",
        goldValue: 950,
      },
    }),
    prisma.lootItem.create({
      data: {
        campaignId: highcrest.id,
        name: "Ashen Ember Band",
        rarity: LootRarity.RARE,
        kind: LootKind.WONDROUS,
        description:
          "A scorched ring that holds one stored flare of radiant heat for emergency defense.",
        sourceTag: "grave cult officers",
        goldValue: 2200,
      },
    }),
    prisma.lootItem.create({
      data: {
        campaignId: sunkenCrown.id,
        name: "Flood Surveyor's Map Tube",
        rarity: LootRarity.COMMON,
        kind: LootKind.TOOL,
        description:
          "Waterproof cartography tube holding layered ruin sketches and tide annotations.",
        sourceTag: "expedition rewards",
        goldValue: 120,
      },
    }),
  ]);

  const cryptWatch = await prisma.encounter.create({
    data: {
      campaignId: highcrest.id,
      title: "Crypt Watch Rotation",
      difficulty: EncounterDifficulty.MEDIUM,
      partyLevel: 5,
      notes:
        "A shrine chamber defended by undead sentries while cultists finish a rite deeper below.",
      monsters: {
        create: [
          {
            monsterId: skeleton.id,
            quantity: 6,
            notes: "Distributed across prayer alcoves.",
          },
          {
            monsterId: gelatinousCube.id,
            quantity: 1,
            notes: "Released if the reliquary seal is broken.",
          },
        ],
      },
    },
  });

  await prisma.encounter.create({
    data: {
      campaignId: highcrest.id,
      title: "Collapsed Drain Ambush",
      difficulty: EncounterDifficulty.HARD,
      partyLevel: 5,
      notes:
        "Goblin outriders drive the party into an ogre-held choke point while the floodgate wheels jam.",
      monsters: {
        create: [
          {
            monsterId: goblin.id,
            quantity: 8,
          },
          {
            monsterId: ogre.id,
            quantity: 1,
          },
        ],
      },
    },
  });

  await prisma.encounter.create({
    data: {
      campaignId: sunkenCrown.id,
      title: "Mangrove Relic Rush",
      difficulty: EncounterDifficulty.HARD,
      partyLevel: 4,
      notes:
        "Rival expedition boats and a reef stalker converge on the same half-submerged altar.",
      monsters: {
        create: [
          {
            monsterId: reefStalker.id,
            quantity: 1,
          },
        ],
      },
    },
  });

  await prisma.inventoryLedgerEntry.createMany({
    data: [
      {
        campaignId: highcrest.id,
        characterId: miri.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.DEPOSIT,
        goldDelta: 820,
        quantity: 0,
        note: "Highcrest vault deposit after the catacomb courier job.",
      },
      {
        campaignId: highcrest.id,
        characterId: miri.id,
        lootItemId: wardKey.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.AWARD,
        quantity: 1,
        goldDelta: 0,
        note: "Stored for later shrine infiltration.",
      },
      {
        campaignId: highcrest.id,
        characterId: toren.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.DEPOSIT,
        goldDelta: 1460,
        quantity: 0,
        note: "Temple reimbursement and pooled grave-tax receipts.",
      },
      {
        campaignId: highcrest.id,
        characterId: toren.id,
        lootItemId: emberBand.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.AWARD,
        quantity: 1,
        goldDelta: 0,
        note: "Recovered from the crypt watch captain.",
      },
      {
        campaignId: sunkenCrown.id,
        characterId: sella.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.DEPOSIT,
        goldDelta: 530,
        quantity: 0,
        note: "Advance pay from the survey guild.",
      },
      {
        campaignId: sunkenCrown.id,
        characterId: sella.id,
        lootItemId: surveyMap.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.AWARD,
        quantity: 1,
        goldDelta: 0,
        note: "Reference maps stored between expeditions.",
      },
      {
        campaignId: highcrest.id,
        characterId: miri.id,
        scope: HoldingScope.INVENTORY,
        entryType: LedgerEntryType.TRANSFER,
        goldDelta: 0,
        quantity: 1,
        lootItemId: wardKey.id,
        note: "Signed out for tonight's vault run.",
      },
      {
        campaignId: highcrest.id,
        characterId: miri.id,
        scope: HoldingScope.BANK,
        entryType: LedgerEntryType.TRANSFER,
        goldDelta: 0,
        quantity: -1,
        lootItemId: wardKey.id,
        note: "Signed out for tonight's vault run.",
      },
    ],
  });

  console.log("Seeded Campaign Vault demo data");
  console.log({
    highcrest: highcrest.slug,
    sunkenCrown: sunkenCrown.slug,
    encounter: cryptWatch.title,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
