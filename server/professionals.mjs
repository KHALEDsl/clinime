// User-approved sample roster. Activation is explicit in environment configuration;
// never silently substitute it for a real clinic's unconfigured team.
const categoryIds = ['skin', 'injectables', 'laser', 'cosmetic', 'consultations'];
export const LOCAL_PROFESSIONALS = [
  ['layla', 'ليلى', 'Layla'], ['noura', 'نورة', 'Noura'], ['sara', 'سارة', 'Sara'],
  ['lama', 'لمى', 'Lama'], ['rema', 'ريما', 'Rema'], ['hana', 'هناء', 'Hana'], ['yara', 'يارا', 'Yara'],
].map(([id, nameAr, nameEn]) => ({ id, nameAr, nameEn, titleAr: 'أخصائية عناية', titleEn: 'Care specialist', image: '/assets/specialists/' + id + '.jpg', categoryIds, active: true }));

export function configuredProfessionals(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    const values = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(values) || !values.length || values.length > 100) return [];
    const seen = new Set();
    const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
    return values.map(value => {
      if (!value || typeof value !== 'object' || !/^[a-z][a-z0-9-]{0,39}$/.test(value.id) || value.id === 'any' || seen.has(value.id) || ![value.nameAr, value.nameEn, value.titleAr, value.titleEn].every(validText)) throw Error('Invalid specialist');
      if (!/^\/assets\/specialists\/[a-z][a-z0-9-]*\.jpg$/.test(value.image) || !Array.isArray(value.categoryIds) || !value.categoryIds.length || value.categoryIds.some(id => !categoryIds.includes(id)) || typeof value.active !== 'boolean') throw Error('Invalid specialist');
      seen.add(value.id);
      return { id: value.id, nameAr: value.nameAr.trim(), nameEn: value.nameEn.trim(), titleAr: value.titleAr.trim(), titleEn: value.titleEn.trim(), image: value.image, categoryIds: [...new Set(value.categoryIds)], active: value.active };
    });
  } catch { return []; }
}

export function publicTeam(professionals, isSample = false) {
  if (!professionals) return {};
  const specialists = structuredClone(professionals.filter(person => person.active));
  return {
    professionals: specialists,
    clinicTeam: [
      { id: 'gigi', nameAr: 'جيجي', nameEn: 'Gigi', titleAr: 'مديرة العيادة', titleEn: 'Clinic manager', role: 'manager', bookable: false },
      { id: 'kender', nameAr: 'كندر', nameEn: 'Kender', titleAr: 'موظف الاستقبال', titleEn: 'Reception', role: 'reception', bookable: false },
      ...specialists.map(person => ({ ...person, role: 'specialist', bookable: true })),
    ],
    rosterIsSample: isSample,
    schedulingMode: 'shared-room',
  };
}
