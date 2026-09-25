// Every item that can ride a conveyor. `value` is what the HQ pays for it as War Bonds.

export const ITEMS = {
  pellets: { name: 'Pellets', kind: 'raw', color: '#f4f1e8', value: 1 },
  tin: { name: 'Tin', kind: 'raw', color: '#a9b4bf', value: 1 },
  powder: { name: 'Bang Powder', kind: 'raw', color: '#3a3533', value: 1 },

  figure: { name: 'Figure', kind: 'part', color: '#6fbf4a', value: 3 },
  plate: { name: 'Tin Plate', kind: 'part', color: '#cfd8e0', value: 2 },
  spring: { name: 'Spring', kind: 'part', color: '#e0b340', value: 1 },
  caps: { name: 'Caps', kind: 'part', color: '#e04a3a', value: 1 },
  firecracker: { name: 'Firecracker', kind: 'part', color: '#d8322a', value: 3 },

  crate_rifle: { name: 'Rifleman', kind: 'crate', unit: 'rifle', color: '#8a6a3c', value: 8 },
  crate_mg: { name: 'Machine Gunner', kind: 'crate', unit: 'mg', color: '#8a6a3c', value: 14 },
  crate_grenadier: { name: 'Grenadier', kind: 'crate', unit: 'grenadier', color: '#8a6a3c', value: 12 },
  crate_medic: { name: 'Glue Medic', kind: 'crate', unit: 'medic', color: '#8a6a3c', value: 14 },
  crate_flamer: { name: 'Flamer', kind: 'crate', unit: 'flamer', color: '#8a6a3c', value: 16 },
  crate_mortar: { name: 'Mortar Team', kind: 'crate', unit: 'mortar', color: '#8a6a3c', value: 20 },
  crate_tank: { name: 'Wind-up Tank', kind: 'crate', unit: 'tank', color: '#8a6a3c', value: 40 },
  crate_plane: { name: 'Tin Biplane', kind: 'crate', unit: 'plane', color: '#8a6a3c', value: 36 },
  crate_colossus: { name: 'COLOSSUS', kind: 'crate', unit: 'colossus', color: '#8a6a3c', value: 150 },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const ITEM_INDEX = Object.fromEntries(ITEM_IDS.map((id, i) => [id, i]));
export const isCrate = (item) => ITEMS[item]?.kind === 'crate';
