// Client-side validation. The database repeats every rule, so these are for fast feedback only.

// Accepts 0772123456, 772123456, 256772123456, +256 772 123 456 -> "+256772123456" or null.
export function normalizeUgPhone(input) {
  let d = String(input || '').replace(/[\s\-().]/g, '')
  if (/^\+256\d{9}$/.test(d)) { /* ok */ }
  else if (/^256\d{9}$/.test(d)) d = '+' + d
  else if (/^0\d{9}$/.test(d)) d = '+256' + d.slice(1)
  else if (/^\d{9}$/.test(d)) d = '+256' + d
  else return null
  return /^\+256[347]\d{8}$/.test(d) ? d : null
}

export function validateDetails(v) {
  const e = {}
  if ((v.full_name || '').trim().length < 2) e.full_name = 'Enter your full name.'
  if (!v.date_of_birth) e.date_of_birth = 'Enter your date of birth.'
  else {
    const dob = new Date(v.date_of_birth)
    const min = new Date(); min.setFullYear(min.getFullYear() - 18)
    const max = new Date(); max.setFullYear(max.getFullYear() - 100)
    if (Number.isNaN(dob.getTime())) e.date_of_birth = 'Enter a valid date.'
    else if (dob > min) e.date_of_birth = 'You must be at least 18 years old to apply.'
    else if (dob < max) e.date_of_birth = 'Enter a valid date of birth.'
  }
  if (!normalizeUgPhone(v.phone_number)) e.phone_number = 'Enter a valid Ugandan number, e.g. 0772 123 456 or +256 772 123 456.'
  if ((v.district || '').trim().length < 2) e.district = 'Enter your district.'
  if ((v.address || '').trim().length < 3) e.address = 'Enter your residential address.'
  return e
}

export function validateAccount(v) {
  const e = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v.email || '').trim())) e.email = 'Enter a valid email address.'
  if ((v.password || '').length < 8) e.password = 'Use at least 8 characters.'
  if (v.password !== v.confirm) e.confirm = 'Passwords do not match.'
  return e
}

export const UG_DISTRICTS = [
  'Kampala','Wakiso','Mukono','Entebbe','Jinja','Mbale','Gulu','Lira','Mbarara','Fort Portal','Masaka','Kabale',
  'Arua','Soroti','Hoima','Masindi','Tororo','Iganga','Kasese','Kisoro','Kabarole','Bushenyi','Ntungamo','Rukungiri',
  'Kamuli','Busia','Kapchorwa','Moroto','Kitgum','Pader','Nebbi','Moyo','Adjumani','Yumbe','Koboko','Kotido','Kumi',
  'Pallisa','Kaberamaido','Apac','Kiryandongo','Luwero','Nakasongola','Mityana','Mubende','Kyenjojo','Kamwenge',
  'Ibanda','Isingiro','Mpigi','Butambala','Gomba','Kalangala','Buikwe','Buvuma','Kayunga','Nakaseke','Rakai',
  'Lyantonde','Sembabule','Kalungu','Bukomansimbi','Lwengo','Bugiri','Mayuge','Namayingo','Butaleja','Sironko',
  'Bulambuli','Manafwa','Namutumba','Kaliro','Luuka','Buyende','Serere','Ngora','Katakwi','Amuria','Alebtong',
  'Oyam','Amolatar','Dokolo','Kole','Agago','Lamwo','Amuru','Nwoya','Omoro','Zombo','Pakwach','Maracha','Madi-Okollo',
  'Kyegegwa','Kibaale','Kakumiro','Kagadi','Buliisa','Bundibugyo','Ntoroko','Kyotera','Rubanda','Rubirizi','Sheema',
  'Mitooma','Kanungu','Buhweju','Kiruhura','Kazo','Kikuube','Bukedea','Butebo','Kibuku','Budaka','Mbale City',
]
