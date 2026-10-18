export type PropertySectionDraft = {
  id: string;
  name: string;
  floors: number[];
  roomsPerFloor: number[];
  defaultBeds: number;
};

export function newPropertySection(id: string, name = ""): PropertySectionDraft {
  return { id, name, floors: [1], roomsPerFloor: [2, 2, 2, 2], defaultBeds: 2 };
}

export function propertySectionPayload(section: PropertySectionDraft, isFlat: boolean) {
  return {
    name: section.name,
    floors: section.floors,
    roomsPerFloor: isFlat ? section.roomsPerFloor.map(() => 1) : section.roomsPerFloor,
  };
}

export function propertyStructureTotals(sections: PropertySectionDraft[], isFlat: boolean) {
  return sections.reduce((total, section) => {
    const { floors, roomsPerFloor } = propertySectionPayload(section, isFlat);
    return {
      floors: total.floors + floors.length,
      rooms: total.rooms + floors.length * roomsPerFloor.length,
      beds: total.beds + floors.length * roomsPerFloor.reduce((sum, count) => sum + count, 0),
    };
  }, { floors: 0, rooms: 0, beds: 0 });
}
