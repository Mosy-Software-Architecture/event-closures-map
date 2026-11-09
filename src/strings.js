// Built-in interface strings. Event-specific text lives in the data files; any key here can be
// overridden per language in data/i18n.json. Other languages fall back to English.
// Rich strings accept **bold** and [text](https://link); {name} placeholders are filled at runtime.
export default {
  es: {
    hour: 'Hora', allDay: 'Todo el día', now: 'Ahora', fit: 'Ver todo',
    total: '{n} calles en total', cut1: '1 calle cortada', cutN: '{n} calles cortadas', cut0: 'Ninguna calle cortada',
    bands: 'Franjas de corte', uncertainLegend: 'Trazado dudoso', popUncertain: 'Trazado dudoso',
    listTitle: 'Lista de calles cortadas por franja horaria', listBand: '{date}, de {from} a {to}',
    updatesTitle: 'Última hora', updatesMore: 'Ver las {n} novedades', updatesLess: 'Ver menos',
    updatesMeta: 'Novedades recogidas de fuentes oficiales y prensa local. Última comprobación: {t}.',
    noticeMore: 'Más', noticeLess: 'Menos',
    noticeDefault: '**Información no oficial.** Los horarios y las calles pueden cambiar: antes de salir, [consulta las fuentes oficiales]({url}) y sigue las indicaciones de los agentes.',
    noticeShortDefault: '**Información no oficial.** Antes de salir, [consulta las fuentes oficiales]({url}).',
    routeTitle: 'Recorrido', routeIntroDefault: 'El recorrido no es un corte: indica por dónde pasa el evento. Los cortes son las franjas de colores.',
    parkingTitle: 'Aparcamiento', bansTitle: 'Prohibido aparcar', bansShow: 'Mostrar en el mapa (banda gris bajo la calle)',
    carParksTitle: 'Aparcamientos con acceso limitado', popBan: 'Prohibido aparcar',
    sourcesTitle: 'Fuentes oficiales', sourcesIntro: 'La información más actualizada está siempre en las fuentes oficiales. Esta página solo la muestra en un mapa.',
    sourcePrimary: 'Fuente principal de este mapa',
    legalTitle: 'Aviso legal',
    legalDefault1: 'Esta página es una iniciativa particular de {entity}, sin vinculación con la organización del evento ni con las administraciones citadas. Las marcas citadas pertenecen a sus titulares.',
    legalDefault2: 'La información se ofrece tal cual y con fines informativos, sin garantía de exactitud, integridad o vigencia. El trazado de las calles es aproximado. {entity} no se responsabiliza de decisiones, retrasos, sanciones o daños derivados de su uso. Ante cualquier duda prevalecen la señalización, los agentes y las fuentes oficiales.',
    legalDefault3: 'Datos del mapa © colaboradores de OpenStreetMap, licencia ODbL; teselas de openstreetmap.org. Esta página no usa cookies ni herramientas de seguimiento.',
    mapBy: 'Mapa', credit: 'Hecho con [event-closures-map](https://github.com/Mosy-Software-Architecture/event-closures-map) de [Tomatic](https://tomatic.ai/)',
    sliderLabel: 'Hora del día', langLabel: 'Idioma'
  },
  en: {
    hour: 'Time', allDay: 'All day', now: 'Now', fit: 'Fit all',
    total: '{n} streets in total', cut1: '1 street closed', cutN: '{n} streets closed', cut0: 'No streets closed',
    bands: 'Closure time slots', uncertainLegend: 'Uncertain outline', popUncertain: 'Uncertain outline',
    listTitle: 'List of closed streets by time slot', listBand: '{date}, from {from} to {to}',
    updatesTitle: 'Latest updates', updatesMore: 'Show all {n} updates', updatesLess: 'Show less',
    updatesMeta: 'News gathered from official sources and local press. Last check: {t}.',
    noticeMore: 'More', noticeLess: 'Less',
    noticeDefault: '**Unofficial information.** Streets and times can change: before you go out, [check the official sources]({url}) and follow the officers on site.',
    noticeShortDefault: '**Unofficial information.** Before you go out, [check the official sources]({url}).',
    routeTitle: 'Course', routeIntroDefault: 'The course is not a closure: it shows where the event goes. The closures are the coloured time slots.',
    parkingTitle: 'Parking', bansTitle: 'No parking', bansShow: 'Show on the map (grey band under the street)',
    carParksTitle: 'Car parks with restricted access', popBan: 'No parking',
    sourcesTitle: 'Official sources', sourcesIntro: 'The most up-to-date information is always in the official sources. This page only shows it on a map.',
    sourcePrimary: 'Main source for this map',
    legalTitle: 'Legal notice',
    legalDefault1: 'This page is a private initiative of {entity}, with no connection to the event organisers or the authorities mentioned. Trademarks belong to their owners.',
    legalDefault2: 'The information is provided as is for information purposes only, with no warranty of accuracy, completeness or currency. Street outlines are approximate. {entity} accepts no liability for decisions, delays, fines or damage arising from its use. In case of doubt, signage, officers and official sources prevail.',
    legalDefault3: 'Map data © OpenStreetMap contributors, ODbL licence; tiles from openstreetmap.org. This page uses no cookies or tracking tools.',
    mapBy: 'Map', credit: 'Built with [event-closures-map](https://github.com/Mosy-Software-Architecture/event-closures-map) by [Tomatic](https://tomatic.ai/)',
    sliderLabel: 'Time of day', langLabel: 'Language'
  }
};
