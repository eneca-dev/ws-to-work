/**
 * Маппинг отделов: Worksection group → название отдела в eneca.work
 *
 * Источник истины — ws-users-to-work/config/department-mapping.js, откуда
 * синхронизируются отделы пользователей. Здесь копия, чтобы task-report
 * не зависел от соседнего репозитория.
 *
 * ⚠️ При изменении отделов в Worksection обновлять ОБА файла.
 *
 * 16 производственных отделов. Незамапленные группы (декрет, админы, клиенты)
 * дают null — такие задачи попадут в отчёт с пустым отделом.
 */

const DEPARTMENT_MAPPING = {
  '(ТСБС) Технические системы безопасности и связи Ⓓ': 'ТСБС',
  '(КР гражд) Констр. отдел по гражданским объектам Ⓓ': 'КР гражд',
  '(СМ) Отдел смет и организации строительства Ⓓ': 'СМ',
  '(АР гражд) Архитектурный отдел Ⓓ': 'АР гражд',
  '(АВТ1) Отдел автоматизации Ⓓ': 'АВТ',
  '(АВТ2) Отдел автоматизации Ⓓ': 'АВТ',
  '(ТХ) Технологический отдел Ⓓ': 'ТХ',
  '(ВК) Отдел водоснабжения и канализации Ⓓ': 'ВК',
  '(ТМ) Тепломеханический отдел Ⓓ': 'ТМ',
  '(ЭС пром) Отдел электроснабжения Ⓓ': 'ЭС пром',
  '(АР пром) Отдел промышленной архитектуры Ⓓ': 'АР пром',
  '(ЭС гражд) Отдел электроснабжения Ⓓ': 'ЭС гражд',
  '(ОВ гражд) Отдел отопления, вентиляции и конд. Ⓓ': 'ОВ гражд',
  '(ОВ пром) Отдел отопления, вентиляции и конд. Ⓓ': 'ОВ пром',
  '(ГПиИС) Отдел генплана и инженерных систем Ⓓ': 'ГПиИС',
  '(КР пром) Констр. отдел по промышленным объектам Ⓓ': 'КР пром',
  '(МТО) Отдел механико-технологический Ⓓ': 'МТО'
};

/**
 * Отдел по группе Worksection
 * @param {string} wsGroup - поле group пользователя из get_users
 * @returns {string|null} название отдела или null, если группа не замаплена
 */
function mapDepartment(wsGroup) {
  if (!wsGroup) return null;
  return DEPARTMENT_MAPPING[wsGroup] || null;
}

/**
 * Карта email → { department, name } по списку пользователей из get_users
 * @param {Array} wsUsers - результат worksection.getUsers()
 * @returns {Map<string, {department: string|null, name: string|null}>}
 */
function buildUserMap(wsUsers) {
  const map = new Map();

  for (const user of wsUsers || []) {
    if (!user || !user.email) continue;
    map.set(String(user.email).toLowerCase(), {
      department: mapDepartment(user.group),
      name: user.name || null
    });
  }

  return map;
}

/**
 * Отделы, попадающие в отчёт. ЖЁСТКО ЗАФИКСИРОВАНО.
 *
 * Отчёт делался под конкретный запрос по отделу «КР гражд».
 * Список намеренно НЕ выведен ни в .env, ни в параметры HTTP-запроса,
 * ни в интерфейс — поменять можно только правкой этой строки.
 *
 * Значения — правая часть DEPARTMENT_MAPPING.
 */
const REPORT_DEPARTMENTS = Object.freeze(['КР гражд']);

module.exports = { DEPARTMENT_MAPPING, REPORT_DEPARTMENTS, mapDepartment, buildUserMap };
