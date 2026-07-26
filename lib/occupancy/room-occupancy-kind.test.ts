import assert from "node:assert/strict";
import { parseRoomOccupancyKind } from "./room-occupancy-kind";

const cases: Array<{ kind: "private_room" | "shared_bed" | "unknown"; text: string }> = [
  {
    kind: "shared_bed",
    text: "Nabízíme lůžko ve sdíleném dvoulůžkovém pokoji v plně vybaveném studentském bytě 3+1",
  },
  {
    kind: "shared_bed",
    text: "Pronájem lůžka ve zrekonstruovaného moderním bytu 2+1, Brno centrum",
  },
  {
    kind: "shared_bed",
    text: "Volné místo v pokoji čtyřlůžkovém, cena 5.850 czk včetně energií",
  },
  {
    kind: "shared_bed",
    text: "Nabízíme k pronájmu lůžko ve sdíleném dvojlůžkovém pokoji v nově zrekonstruovaných studentských kolejích",
  },
  {
    kind: "shared_bed",
    text: "Nabízíme pronájem pro 1 osobu v pokoji pro dva (17m2) v bytě 3+1",
  },
  {
    kind: "shared_bed",
    text: "Pronájem neprůchozího pokoje nebo jednotlivého lůžka | Brno – Kunzova",
  },
  {
    kind: "shared_bed",
    text: "Nabízíme lůžko ve světlém a prostorném sdíleném pokoji v krásném bytě",
  },
  {
    kind: "private_room",
    text: "Nabízím k pronájmu útulný a světlý soukromý pokoj v klidném bytě na ulici Pražská",
  },
  {
    kind: "private_room",
    text: "Pronájem soukromého pokoje – Brno, ul. Jeronýmova. Sou­kromý, plně vybavený pokoj ve sdíleném bytě",
  },
  {
    kind: "private_room",
    text: "Nabízíme pronájem jednolůžkového pokoje v nově zrekonstruovaném objektu",
  },
  {
    kind: "private_room",
    text: "Nabízím k pronájmu samostatný pokoj 13 m2 se dřezem v prvním patře",
  },
  {
    kind: "private_room",
    text: "Dobrý den, nabízím pět jednolůžkových pokojů pro STUDENTKY v lokalitě Brno-Jundrov",
  },
  {
    kind: "private_room",
    text: "Camera singola luminosa in appartamento condiviso vicino al centro",
  },
  {
    kind: "shared_bed",
    text: "Affittasi posto letto in camera condivisa con due letti",
  },
  {
    kind: "unknown",
    text: "",
  },
  {
    kind: "unknown",
    text: null as unknown as string,
  },
];

for (const { kind, text } of cases) {
  assert.equal(
    parseRoomOccupancyKind(text),
    kind,
    `expected ${kind} for: ${String(text).slice(0, 80)}`,
  );
}

console.log(`ok — ${cases.length} room occupancy kind cases`);
