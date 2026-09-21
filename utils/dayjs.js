import dayjs from "dayjs";
import "dayjs/locale/ka";
import "dayjs/locale/ru";
// "en" is dayjs's built-in default locale — no import needed.

// Default stays Georgian; services/i18n.js switches it when the user picks a
// language.
dayjs.locale("ka");

export default dayjs;
