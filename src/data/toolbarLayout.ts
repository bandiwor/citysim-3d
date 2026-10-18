/** Порядок разделов в нижнем ряду, по группам (между группами — разделитель). */
export const CATEGORY_LAYOUT: string[][] = [
  ['roads', 'zones'],
  ['power', 'water', 'garbage'],
  ['safety', 'health', 'education'],
  ['parks', 'landmarks', 'transit'],
  ['terrain', 'nature'],
  ['tools'],
];

/**
 * Порядок пунктов в разделах панели строительства: раздел → группы (между группами — тонкий разделитель) → id пунктов.
 * Внутри группы — от маленького и дешёвого к крупному. Пункт, которого нет в раскладке, попадает в конец раздела отдельной группой.
 */
export const TOOLBAR_LAYOUT: Record<string, string[][]> = {
  roads: [
    ['road:alley', 'road:street', 'road:oneway', 'road:country'],
    ['road:avenue', 'road:boulevard', 'road:highway'],
    ['light:add', 'light:remove'],
  ],
  zones: [
    ['zone:res:0', 'zone:res:1', 'zone:res:2'],
    ['zone:com:0', 'zone:com:1', 'zone:com:2'],
    ['zone:ind:0', 'zone:ind:1', 'zone:ind:2'],
    ['zone:none'],
  ],
  power: [
    ['service:wind', 'service:windfarm', 'service:solar', 'service:geothermal'],
    ['service:coal', 'service:gas', 'service:nuclear'],
  ],
  water: [
    ['service:well', 'service:watertower', 'service:pumpstation'],
    ['service:waterplant', 'service:desalination'],
  ],
  safety: [
    ['service:policepost', 'service:police', 'service:policehq'],
    ['service:firepost', 'service:fire', 'service:firehq', 'service:firehelidepot'],
  ],
  health: [
    ['service:pharmacy', 'service:clinic'],
    ['service:hospital', 'service:medcenter'],
  ],
  education: [
    ['service:kindergarten', 'service:school', 'service:highschool'],
    ['service:college', 'service:university'],
    ['service:library'],
  ],
  parks: [
    ['service:garden', 'service:park', 'service:bigpark', 'service:plaza'],
    ['service:sports', 'service:stadium'],
  ],
  garbage: [
    ['service:landfill', 'service:recycling', 'service:incinerator'],
    ['service:cemetery', 'service:crematorium'],
  ],
  landmarks: [
    ['service:townhall', 'service:clocktower', 'service:monument', 'service:obelisk', 'service:arch'],
    ['service:cathedral', 'service:opera', 'service:tvtower', 'service:ferriswheel'],
  ],
  transit: [
    ['service:busdepot', 'stop', 'route'],
    ['service:taxidepot'],
  ],
  tools: [['select', 'bulldoze'], ['walk']],
  terrain: [
    ['terraform:raise', 'terraform:lower'],
    ['terraform:flatten', 'terraform:smooth'],
  ],
  nature: [['prop:single', 'prop:brush'], ['prop:erase']],
};

/** Пункты раздела, разложенные по группам в порядке раскладки (пустые группы опускаются). */
export function layoutGroups<T extends { id: string }>(category: string, items: T[], layout: string[][] = TOOLBAR_LAYOUT[category] ?? []): T[][] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups: T[][] = [];
  for (const ids of layout) {
    const g = ids.map((id) => byId.get(id)).filter((i): i is T => !!i);
    for (const i of g) byId.delete(i.id);
    if (g.length) groups.push(g);
  }
  if (byId.size) groups.push([...byId.values()]);
  return groups;
}
