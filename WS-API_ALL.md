Worksection АPI

API (от англ. Application Program Interface) – это интерфейс прикладного программирования для интеграции одного программного обеспечения с другим.

Worksection API позволяет вам получить доступ к сервису и запросить/​отослать данные с целью синхронного взаимодействия с другими программами.

Полезные материалы:
Библиотека SDK для упрощения работы с нашим API. 
Библиотека OAuth 2.0 для удобной работы с Worksection OAuth 2.0. 
Коллекции методов в Postman.
Возможности Worksection API

Представлены все основные возможности и функции, которые есть в самой системе, а именно:

По участникам и контактам:
создание команд для участников и папок для контактов
создание контактов
приглашение новых участников в аккаунт
получение списков команд, участников, контактов
добавление и исключение участников по проектам
подписка и отписка участников по заданиям

По заданиям и комментариям:
создание, редактирование, закрытие и повторное открытие заданий
получение данных по заданиям
получение списка:
всех заданий
заданий определенного проекта
заданий согласно параметрам поиска
создание и получение комментариев по заданиям
создание, установка и снятие статусов/​меток по заданиям

По проектам:
создание, редактирование, архивирование и активирование проектов
создание папок
получение данных по проектам
получение списка проектов и папок
создание, установка и снятие проектных статусов/​меток

По внесенным затратам и работе с таймерами:
создание, обновление и удаление временных и финансовых затрат
получение отдельных строк затрат и их суммы по проектам и отдельным заданиям
получение списка включенных таймеров участников
возможность остановить включенные таймеры участников

По файлам:
возможность прикреплять файлы к комментариям и описаниям проектов/​задач в момент их создания, а также скачивать загруженные и прикрепленные файлы

Обратите внимание! Чтобы предотвратить потерю, случайное удаление или специальное уничтожение важных данных в системе отсутствует функционал удаления по API: 

проектов/​заданий/​комментариев
участников/​контактов
статусов/​меток проектов/​задач
загруженных и прикрепленных файлов
Эта статья была вам полезна? Да, спасибо! Нет
Авторизация для Worksection API

Доступ к Worksection API может осуществляться через:
админский токен
*предоставляет максимальные права
пользовательский токен (oauth2 токен доступа)
*предоставляет ограниченные права (согласно роли пользователя и разрешений приложения)
Админский токен
​​​Используется следующий базовый URL:
https://youraccount.worksection.com/api/admin/v2/
Админский токен формируется в формате MD5 из списка всех параметров, используемых в запросе, и административного API ключа аккаунта (см. пример ниже).

Пример для метода get_tasks
?action=get_tasks&id_project=26
Формирование токена (на PHP)
$query_params = 'action=get_tasks&id_project=26';
$api_key = '7776461cd931e7b1c8e9632ff8e979ce';

$hash = md5($query_params.$apikey);
Итоговый запрос
https://youraccount.worksection.com/api/admin/v2/?action=get_tasks&
id_project=26&hash=ec3ab2c28f21b4a07424f8ed688d6644
Пользовательский токен
*oauth2 токен доступа
​​
Используется следующий базовый URL:
https://youraccount.worksection.com/api/oauth2
Токен доступа можно сформировать через специальный запрос (см. детальнее). Действителен на протяжении 24-х часов. Далеe необходимо обновить его с помощью отдельного токена (refresh token) или сформировать новый.

Пример для метода get_tasks
?action=get_tasks&id_project=26
Итоговый запрос
*через header авторизации
curl -X GET -H "Authorization: Bearer <token_value>"
https://youraccount.worksection.com/api/oauth2?action=get_tasks&id_project=26
*через параметр access_token
https://youraccount.worksection.com/api/oauth2?action=get_tasks&id_project=26&
access_token=<token_value>
Эта статья была вам полезна? Да, спасибо! Нет
Получение административного API ключа

Административный API ключ используется для формирования админского токена, необходимого для авторизации в Worksection API.



Аккаунт → API → Показать API ключ




Обратите внимание! Доступ к административному API ключу есть только у Владельца аккаунта!

Эта статья была вам полезна? Да, спасибо! Нет
Получение токена доступа OAuth 2.0

Данные для доступа можно получить путем исполнения POST-запроса на URL-адрес токена с кодом авторизации:

https://worksection.com/oauth2/token
POST-запрос должен содержать обязательные параметры:

ПАРАМЕТР
ОПИС
client_id
client_id, полученный при создании приложения.
client_secret
client_secret, полученный при создании приложения.
grant_type
Всегда указываем значения authorization_code.
code
Код авторизации (см. детальнее).
redirect_uri
URI, куда будет перенаправлен ответ. URI должен соответствовать требованиям стандарта OAuth2 и использовать протокол HTTPS.

Пример CURL:

curl -X POST -d "client_id=<client_id>&client_secret=<client_secret>&
grant_type=authorization_code&code=<authorization_code>&
redirect_uri=<redirect_uri>"
https://worksection.com/oauth2/token 
Пример ответа:

{
    "token_type": "Bearer",
    "expires_in": 86400,
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJh...",
    "refresh_token": "def502005534a202e9e8effa05cdbad564015604f34...",
    "account_url": "https://authorizeduseraccount.worksection.com"
}
Полученные access_token и refresh_token будем использовать в следующих запросах для доступа к API и обновления access_token. Срок действия access_token - 24 часа, срок действия refresh_token - 1 месяц.
Эта статья была вам полезна? Да, спасибо! Нет
Лимиты и оптимизация API

На использование API установлены следующие лимиты:

GET Для GET-запросов действует ограничение сервера в 8 кБ. Если запрос превышает этот размер, будет возвращена ошибка 414 Request-URL Too Large.

POST В POST-запросах данные передаются через Body, поэтому ограничение на длину URL не актуально. Однако существуют внутренние лимиты системы на длину названия задачи, команды, описания и других полей. Для описания лимит составляет 65 кБ (65536 символов). Если описание превышает этот объём, лишняя часть будет просто обрезана — при этом система не вернет ошибку.

Частота запросов. Не более 1 запроса в секунду. При превышении возвращается ошибка Too many requests.

Количество записей в ответе. Лимит составляет 10 000 записей. Например, если в аккаунте более 10 000 задач, то запрос, который пытается получить все задачи аккаунта, вернёт ошибку ​“Too many tasks (10000 max)”.

Рекомендации:
Используйте вебхуки вместо частого опроса (polling), где это возможно — это значительно снижает количество запросов.
Чтобы не превышать лимиты API и уменьшить нагрузку на систему, избегайте большого количества одиночных запросов для получения каждого элемента отдельно. Используйте групповую выдачу с нужными фильтрами — это сокращает число обращений, ускоряет обработку данных и повышает стабильность интеграции.
Если особенности вашей бизнес-логики требуют большого количества запросов, пожалуйста, обратитесь к нам через форму поддержки

Мы рассмотрим ваш кейс и постараемся помочь — например, добавив дополнительные параметры к запросам, чтобы уменьшить их количество.
Получение списка пользователей через API: get_users

Пример get_users запроса

?action=get_users
Возвращает данные пользователей аккаунта
Возвращаемые данные:
id — ID пользователя
first_name — имя пользователя
last_name — фамилия пользователя
name — имя и фамилия пользователя
title — должность пользователя
url — url адрес пользователя
services — объект из двух других вложенных объектов: chats (месенджеры) и socials (соцсети)
contacts — инфо из поля "Прочие контакты"
*не возвращается, если пустое
data_added — дата и время отправки приглашения пользователю
*возвращается при использовании админского токена
rate — ставка пользователя (если указано)
avatar — ссылка на изображение аватарки пользователя
group — название команды
department — название отдела
role — роль пользователя:
owner — владелец
account admin — администратор аккаунта
team admin — администратор команды
department admin — администратор отдела
user — пользователь
guest — гость
reader — читатель 
email — email пользователя
phone — основной номер телефона (если указано)
phone2 — рабочий номер телефона (если указано) 
phone3 — мобильный номер телефона (если указано) 
phone4 — домашний номер телефона (если указано) 
address — адрес (если указано) 
address2 — дополнительный адрес (если указано) 

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "USER_ID",
            "first_name": "USER_FIRST_NAME_1",
            "last_name": "USER_LAST_NAME_1",
            "name": "USER_NAME",
            "title": "USER_POSITION",
            "url": "USER_URL",
            "services": {
                "chats": {
                    "WhatsApp": "...",
                    ... ... ...
                },
                "socials": {
                    "LinkedIn": "...",
                    ... ... ...
                }
            },
            "contacts": "USER_OTHER_CONTACTS",
            "date_added": "YYYY-MM-DD HH:MM",
            "rate": USER_RATE,
            "avatar": "URL",
            "group": "USER_GROUP",
            "department": "USER_DEPARTMENT",
            "role": "USER_ROLE",
            "email": "USER_EMAIL",
            "phone": "USER_PHONE",
            "phone2": "USER_PHONE_2",
            "phone3": "USER_PHONE_3",
            "address": "USER_ADDRESS",
            "address2": "USER_ADDRESS_2"
        },
        {
            "id": "USER_ID",
            "first_name": "USER_FIRST_NAME_2",
            "last_name": "USER_LAST_NAME_2",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Приглашение пользователя в аккаунт через API: add_user

Пример add_user запроса

?action=add_user&email=USER_EMAIL
Приглашение в аккаунт нового пользователя
*в вашу команду, если не указан параметр group

Обязательные параметры:
email — email пользователя

Необязательные параметры:
first_name — имя пользователя
last_name — фамилия пользователя
title — должность пользователя
group — название команды
department — название отдела
role — роль пользователя. Доступные варианты:
user — пользователь
guest — гость
reader — читатель 
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "USER_ID",
        "first_name": "USER_FIRST_NAME",
        "last_name": "USER_LAST_NAME",
        "name": "USER_NAME",
        "title": "USER_POSITION",
        "rate": USER_RATE,
        "avatar": "URL",
        "group": "GROUP_NAME",
        "department": "USER_DEPARTMENT",
        "role": "USER_ROLE",
        "email": "USER_EMAIL"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наименований команд участников через API: get_user_groups

Пример get_user_groups запроса

?action=get_user_groups
Возвращает список команд участников аккаунта
Возвращаемые данные:
id — ID команды
title — название команды
client — тип команды:
0 — внутренняя команда компании
1 — клиентская команда

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME",
            "type": "company",
            "client": 0
        },
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME",
            "type": "company",
            "client": 1
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание команды для участников в аккаунте через API: add_user_group

Пример add_user_group запроса 

?action=add_user_group&title=USER_GROUP
Создает команду
*при отсутствии команды с аналогичным названием

Обязательные параметры:
title — название команды

Необязательные параметры:
client — 1 для клиентской команды и 0 для команды компании
Пример JSON ответа
При успешном выполнении, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "GROUP_ID",
        "title": "USER_GROUP_NAME",
        "type": "company",
        "client": 1
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка контактов через API: get_contacts

Пример get_contacts запроса

?action=get_contacts
Возвращает информацию по контактам аккаунта
Возвращаемые данные:
id — ID контакта
first_name — имя контакта
last_name — фамилия контакта
name — имя и фамилия контакта
title — должность контакта
url — url адрес контакта
services — объект из двух других вложенных объектов: chats (месенджеры) и socials (соцсети)
contacts — инфо из поля "Прочие контакты"
*не возвращается, если пустое
data_added — дата и время добавления контакта
*возвращается при использовании админского токена
group — название папки контактов
email — email контакта
phone — основной номер телефона (если указано)
phone2 — рабочий номер телефона (если указано) 
phone3 — мобильный номер телефона (если указано) 
phone4 — домашний номер телефона (если указано) 
address — адрес (если указано) 
address2 — дополнительный адрес (если указано) 

Пример JSON ответа
При успешном выполнении, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "CONTACT_ID",
            "first_name": "CONTACT_FIRST_NAME",
            "last_name": "CONTACT_LAST_NAME",
            "name": "CONTACT_NAME",
            "title": "CONTACT_POSITION",
            "url": "CONTACT_URL",
            "services": {
                "chats": {
                    "WhatsApp": "...",
                    ... ... ...
                },
                "socials": {
                    "LinkedIn": "...",
                    ... ... ...
                }
            },
            "contacts": "CONTACT_OTHER_CONTACTS",
            "date_added": "YYYY-MM-DD HH:MM",
            "group": "CONTACT_GROUP",
            "email": "CONTACT_EMAIL",
            "phone": "CONTACT_PHONE",
            "phone2": "CONTACT_PHONE_2",
            "phone3": "CONTACT_PHONE_3",
            "phone4": "CONTACT_PHONE_4",
            "address": "CONTACT_ADDRESS",
            "address2": "CONTACT_ADDRESS_2"
        },
        {
            "id": "CONTACT_ID",
            "first_name": "CONTACT_FIRST_NAME",
            "last_name": "CONTACT_LAST_NAME",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание контакта через API: add_contact

Пример add_contact запроса

?action=add_contact&name=CONTACT_NAME&email=CONTACT_EMAIL
Создает контакт
*не имеет доступа в аккаунт

Обязательные параметры:
email — email контакта
name — имя и фамилия контакта

Необязательные параметры:
title — должность контакта
group — название папки контактов
phone — основной номер телефона контакта
phone2 — рабочий номер телефона 
phone3 — мобильный номер телефона 
phone4 — домашний номер телефона 
address — адрес контакта
address2 — дополнительный адрес контакта
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "CONTACT_ID",
        "first_name": "CONTACT_FIRST_NAME",
        "last_name": "CONTACT_LAST_NAME",
        "name": "CONTACT_NAME",
        "title": "CONTACT_POSITION",
        "group": "GROUP_NAME",
        "email": "CONTACT_EMAIL",
        "phone": "CONTACT_PHONE",
        "phone2": "CONTACT_PHONE_2",
        "phone3": "CONTACT_PHONE_3",
        "phone4": "CONTACT_PHONE_4",
        "address": "CONTACT_ADDRESS",
        "address2": "CONTACT_ADDRESS_2"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наименований папок для контактов через API: get_contact_groups

Пример get_contact_groups запроса

?action=get_contact_groups
Возвращает данные по папкам для контактов аккаунта
Возвращаемые данные:
id — ID папки
title — название папки
type — тип папки:
preset — папка для контактов, созданная по умолчанию
folder — папка для контактов, созданная участником аккаунта

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME",
            "type": "preset"
        },
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME",
            "type": "folder"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание папки для контактов через API: add_contact_group

Пример add_contact_group запроса

?action=add_contact_group&title=CONTACT_GROUP
Создает папку для контактов
*при отсутствии папки с аналогичным названием

Обязательные параметры:
title — название папки для контактов
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "CONTACT_GROUP_ID",
        "title": "CONTACT_GROUP",
        "type": "folder"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Подписать пользователя на задачу через API: subscribe

Пример subscribe запроса

?action=subscribe&id_task=TASK_ID&email_user=USER_EMAIL
Подписывает пользователя на указанное задание
*список подписчиков задания можно получить через метод get_task при указании параметра extra=subscribers

Обязательные параметры:
id_task — ID задания
email_user — email пользователя
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}

Эта статья была вам полезна? Да, спасибо! Нет
Отписать пользователя от задачи через API: unsubscribe

Пример unsubscribe запроса

?action=unsubscribe&id_task=TASK_ID&email_user=USER_EMAIL
Отписывает пользователя от указанного задания
*список подписчиков задания можно получить через метод get_task при указании параметра extra=subscribers

Обязательные параметры:
id_task — ID задания
email_user — email пользователя
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}

Эта статья была вам полезна? Да, спасибо! Нет
Получение списка нерабочих дней пользователей через API: get_users_schedule

Пример get_users_schedule запроса

?action=get_users_schedule
Возвращает даты отпусков, больничных и работы в выходные дни пользователей аккаунта
*данные берутся из окна "График работы"

Необязательные параметры:
users — список пользователей через запятую (например: users=ws.user@domain.com,120)
Поддерживаются email пользователей или их ID (можно получить через метод get_users)
datestart и dateend — диапазон дат для поиска данных в формате DD.MM.YYYY (даты считаются включительно)
Возвращаемые данные:
id — ID пользователя
email — email пользователя
name — имя и фамилия пользователя
group — название команды
department — название отдела
schedule — список нерабочих и дополнительных рабочих дней пользователя:
vacation — отпуск
sick-leave — больничный
workday — работает в выходной

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "USER_ID_1": {
            "id": "USER_ID_1",
            "email": "USER_EMAIL",
            "name": "USER_NAME",
            "group": "USER_GROUP",
            "department": "USER_DEPARTMENT",
            "schedule": {
                "2021-01-04": "vacation",
                "2021-03-13": "workday",
                "2021-10-15": "sick-leave",
                "2021-12-24": "vacation",
            }
        },
        "USER_ID_2": {
            ... ... ...
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Установка и снятие нерабочих дней пользователей через API: update_users_schedule

Пример update_users_schedule запроса

?action=update_users_schedule&data={"user@ws.com":{"07.06.2021":"vacation",
"08.06.2021":"vacation"}, "3993":{"2021-06-12":"unset"}}
Установка и снятие дат отпусков, больничных и работы в выходные дни пользователей аккаунта
*изменения отображаются в окне "График работы" пользователей

Обязательные параметры:
data — список пользователей с отдельным набором дат для каждого
Поддерживаются email пользователей или их ID (можно получить через метод get_users). Поддерживаются форматы дат DD.MM.YYYY и YYYY-MM-DD

Доступные значения для управления датами
vacation — установка отпуска
sick-leave — установка больничного
workday — установка рабочего дня в выходной
unset — снятие установленного значения
Установка нового значения автоматически заменяет ранее установленное; предварительное использование unset не требуется.
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [],
    "message": "Days added: 2, days updated: 1"
}

Эта статья была вам полезна? Да, спасибо! Нет
Получение информации об авторизованном пользователе через API: me

Пример me запроса

?action=me
Возвращает информацию об авторизованном пользователе (oauth2)

метод доступен только при использовании токена доступа
Возвращаемые данные:
id — ID пользователя
first_name — имя пользователя
last_name — фамилия пользователя
name — имя и фамилия пользователя
title — должность пользователя
avatar — ссылка на изображение аватарки пользователя
group — название команды
department — название отдела
role — роль пользователя:
owner — владелец
account admin — администратор аккаунта
team admin — администратор команды
department admin — администратор отдела
user — пользователь
guest — гость
reader — читатель 
email — email пользователя
phone — основной номер телефона (если указано)
phone2 — рабочий номер телефона (если указано) 
phone3 — мобильный номер телефона (если указано) 
phone4 — домашний номер телефона (если указано) 
address — адрес (если указано) 
address2 — дополнительный адрес (если указано) 

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "USER_ID",
            "first_name": "USER_FIRST_NAME_1",
            "last_name": "USER_LAST_NAME_1",
            "name": "USER_NAME",
            "title": "USER_POSITION",
            "rate": USER_RATE,
            "avatar": "URL",
            "group": "USER_GROUP",
            "department": "USER_DEPARTMENT",
            "role": "USER_ROLE",
            "email": "USER_EMAIL",
            "phone": "USER_PHONE",
            "phone2": "USER_PHONE_2",
            "phone3": "USER_PHONE_3",
            "address": "USER_ADDRESS",
            "address2": "USER_ADDRESS_2"
        }
    ]
}
Получение списка проектов через API: get_projects

Пример get_projects запроса

?action=get_projects
Возвращает данные по всем проектам

Необязательные параметры:
filter — состояние проекта, возможные значения: active, pending, archived
extra — дополнительные данные по проекту, возможные значения (можно указывать через запятую, например extra=text,options,users):
text или html — описание в текстовом или html формате
options — ограничения проекта
users — участники команды проекта
Возвращаемые данные:
id — ID проекта
name — название проекта
status — состояние проектастатус
company — название папки, в которой размещен проект
user_from и user_to — создатель проекта и руководитель проекта
text — описание проекта в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_closed — дата и время закрытия (если проект перемещен в архив) или дата и время предыдущего закрытия (если проект активный)
date_start — дата начала проекта (если указано)
date_end — дата окончания проекта (если указано)
options — ограничения проекта со значениями 0/ 1 — отключено/включено (возвращаются, если в запросе указан параметр extra=options): 
Исполнитель может:
options.allow_close — закрывать задания
options.allow_give — передавать ответственность 
options.allow_term — изменять сроки задачи
options.allow_limit — изменять предполагаемые затраты
При постановке задач требовать PRO:
options.require_term — сроки
options.require_tag — статусы и метки
options.require_limit — предполагаемые затраты
options.require_hidden — видимость
Пользователям запрещено PRO:
options.deny_comments_edit — редактировать и удалять комментарии
options.deny_task_edit — редактировать и удалять задачи
options.deny_task_delete — удалять задачи
Настройка внесения затрат PRO:
options.time_require — не закрывать задачи без затрат
options.time_today — только за текущий день
options.timer_only — только с таймера
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — массив в формате id: name для тегов проекта (если указаны)
users — участники команды проекта (если в запросе указан соответствующий параметр extra)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [ 
        {
            "id": "PROJECT_ID_1",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/",
            "status": "active",
            "company": "FOLDER_NAME",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "user_to": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "text": "PROJECT_TEXT",
            "date_added": "YYYY-MM-DD HH:II",
            "date_start": "YYYY-MM-DD",
            "date_end": "YYYY-MM-DD",
            "date_closed": "YYYY-MM-DD HH:II",
            "options": {
               "allow_close": 0..1,
               "allow_give": 0..1,
               "allow_term": 0..1,
               "allow_limit": 0..1,
               "require_term": 0..1,
               "require_tag": 0..1,
               "require_limit": 0..1,
               "require_hidden": 0..1,
               "deny_comments_edit": 0..1,
               "deny_task_edit": 0..1,
               "deny_task_delete": 0..1,
               "time_require": 0..1,
               "time_today": 0..1,
               "timer_only": 0..1
            },
            "max_time": 100,
            "max_money": 500,
            "users": [
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                }
            ]
        },
        {
            "id": "PROJECT_ID_2",
            "name": "PROJECT_NAME",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение данных проекта через API: get_project

Пример get_project запроса

?action=get_project&id_project=PROJECT_ID
Возвращает данные выбранного проекта

Обязательные параметры:
id_project — ID проекта
Необязательные параметры:
extra — дополнительные данные по проекту, возможные значения (можно указывать через запятую, например extra=text,options,users):
text или html — описание в текстовом или html формате
options — ограничения проекта
users — участники команды проекта
Возвращаемые данные:
id — ID проекта
name — название проекта
status — состояние проектастатус
company — название папки, в которой размещен проект
user_from и user_to — создатель проекта и руководитель проекта
text — описание проекта в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_closed — дата и время закрытия (если проект перемещен в архив) или дата и время предыдущего закрытия (если проект активный)
date_start — дата начала проекта (если указано)
date_end — дата окончания проекта (если указано)
options — ограничения проекта со значениями 0/ 1 — отключено/включено (возвращаются, если в запросе указан параметр extra=options):
Исполнитель может:
options.allow_close — закрывать задания
options.allow_give — передавать ответственность 
options.allow_term — изменять сроки задачи
options.allow_limit — изменять предполагаемые затраты
При постановке задач требовать PRO:
options.require_term — сроки
options.require_tag — статусы и метки
options.require_limit — предполагаемые затраты
options.require_hidden — видимость
Пользователям запрещено PRO:
options.deny_comments_edit — редактировать и удалять комментарии
options.deny_task_edit — редактировать и удалять задачи
options.deny_task_delete — удалять задачи
Настройка внесения затрат PRO:
options.time_require — не закрывать задачи без затрат
options.time_today — только за текущий день
options.timer_only — только с таймера
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — массив в формате id: name для тегов проекта (если указаны)
users — участники команды проекта (если в запросе указан соответствующий параметр extra)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "PROJECT_ID",
        "name": "PROJECT_NAME",
        "page": "/project/PROJECT_ID/",
        "status": "active",
        "company": "FOLDER_NAME",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "text": "PROJECT_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "date_closed": "YYYY-MM-DD HH:II",
        "options": {
            "allow_close": 0..1,
            "allow_give": 0..1,
            "allow_term": 0..1,
            "allow_limit": 0..1,
            "require_term": 0..1,
            "require_tag": 0..1,
            "require_limit": 0..1,
            "require_hidden": 0..1,
            "deny_comments_edit": 0..1,
            "deny_task_edit": 0..1,
            "deny_task_delete": 0..1,
            "time_require": 0..1,
            "time_today": 0..1,
            "timer_only": 0..1
        },
        "max_time": 100,
        "max_money": 500,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        },
        "users": [
            {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME_1"
            },
            {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME_2"
            },
            {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME_3"
            }
        ]
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание проекта через API: post_project

Пример post_project запроса

?action=post_project&title=PROJECT_NAME
Создает проект
*позволяет прикреплять файлы (см. детальнее)

Обязательные параметры:
title — название проекта

Необязательные параметры:
email_user_from — email автора проекта
email_manager — email руководителя проекта
email_user_to — email ответственного по умолчанию при создании заданий, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
members — email участников проекта (через запятую)
text — описание проекта 
company — название папки, в которой будет размещен проект
datestart — дата старта проекта в формате DD.MM.YYYY
dateend — дата завершения проекта в формате DD.MM.YYYY
ограничения проекта (значение равное 1 для включения):
Исполнитель может:
options.allow_close — закрывать задания
options.allow_give — передавать ответственность 
options.allow_term — изменять сроки задачи
options.allow_limit — изменять предполагаемые затраты
При постановке задач требовать PRO:
options.require_term — сроки
options.require_tag — статусы и метки
options.require_limit — предполагаемые затраты
options.require_hidden — видимость
Пользователям запрещено PRO:
options.deny_comments_edit — редактировать и удалять комментарии
options.deny_task_edit — редактировать и удалять задачи
options.deny_task_delete — удалять задачи
Настройка внесения затрат PRO:
*в этом блоке одновременно можно включить только один параметр
options.time_require — не закрывать задачи без затрат
options.time_today — только за текущий день
options.timer_only — только с таймера
extra=options — возвращает список ограничений проекта
max_time — плановые временные затраты
max_money — плановые финансовые затраты
tags — теги проекта через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_project_tags)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "PROJECT_ID",
        "name": "PROJECT_NAME",
        "page": "/project/PROJECT_ID/",
        "status": "active",
        "company": "FOLDER_NAME",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "text": "PROJECT_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "options": {
            "allow_close": 0..1,
            "allow_give": 0..1,
            "allow_term": 0..1,
            "allow_limit": 0..1,
            "require_term": 0..1,
            "require_tag": 0..1,
            "require_limit": 0..1,
            "require_hidden": 0..1,
            "deny_comments_edit": 0..1,
            "deny_task_edit": 0..1,
            "deny_task_delete": 0..1,
            "time_require": 0..1,
            "time_today": 0..1,
            "timer_only": 0..1
        },
        "max_time": 100,
        "max_money": 500,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Редактирование проекта через API: update_project

Пример update_project запроса

?action=update_project&id_project=PROJECT_ID
Редактирует параметры указанного проекта

Обязательные параметры:
id_project — ID проекта

Необязательные параметры:
email_manager — email руководителя проекта
email_user_to — email ответственного по умолчанию при создании заданий, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
members — email добавляемых участников проекта через запятую (для исключения используйте метод delete_project_members)
title — название проекта
datestart — дата старта проекта в формате DD.MM.YYYY
dateend — дата завершения проекта в формате DD.MM.YYYY 
ограничения проекта (возможные значения 0/ 1 — отключить/включить):
Исполнитель может:
options.allow_close — закрывать задания
options.allow_give — передавать ответственность 
options.allow_term — изменять сроки задачи
options.allow_limit — изменять предполагаемые затраты
При постановке задач требовать PRO:
options.require_term — сроки
options.require_tag — статусы и метки
options.require_limit — предполагаемые затраты
options.require_hidden — видимость
Пользователям запрещено PRO:
options.deny_comments_edit — редактировать и удалять комментарии
options.deny_task_edit — редактировать и удалять задачи
options.deny_task_delete — удалять задачи
Настройка внесения затрат PRO:
*в этом блоке одновременно можно включить только один параметр
options.time_require — не закрывать задачи без затрат
options.time_today — только за текущий день
options.timer_only — только с таймера
extra=options — возвращает список ограничений проекта
max_time — плановые затраты времени
max_money — плановые затраты денег
tags — теги проекта через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_project_tags). Переданные теги перезаписывают ранее установленные. Для выборочного добавления или снятия тегов используйте метод update_project_tags

Недоступные к редактированию параметры:
email_user_from — email автора проекта
text — описание проекта
company — папка, в которой размещен проект
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:
 
{
    "status": "ok",
    "data": {
        "id": "PROJECT_ID",
        "name": "PROJECT_NAME",
        "page": "/project/PROJECT_ID/",
        "status": "active",
        "company": "FOLDER_NAME",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "text": "PROJECT_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "options": {
            "allow_close": 0..1,
            "allow_give": 0..1,
            "allow_term": 0..1,
            "allow_limit": 0..1,
            "require_term": 0..1,
            "require_tag": 0..1,
            "require_limit": 0..1,
            "require_hidden": 0..1,
            "deny_comments_edit": 0..1,
            "deny_task_edit": 0..1,
            "deny_task_delete": 0..1,
            "time_require": 0..1,
            "time_today": 0..1,
            "timer_only": 0..1
        },
        "max_time": 100,
        "max_money": 500,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Архивирование проекта через API: close_project

Пример close_project запроса

?action=close_project&id_project=PROJECT_ID
Архивирует указанный проект

Обязательные параметры:
id_project — ID проекта
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Активация проекта API: activate_project

Пример activate_project запроса 

?action=activate_project&id_project=PROJECT_ID
Активирует указанный архивный проект


Обязательные параметры:
id_project — ID проекта
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Добавление людей в команду проекта через API: add_project_members

Пример add_project_members запроса

?action=add_project_members&id_project=PROJECT_ID&
members=USER_EMAIL_1,USER_EMAIL_2
Добавляет участников аккаунта в команду выбранного проекта

Обязательные параметры:
id_project — ID проекта
members — email учасников (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Исключение людей из команды проекта через API: delete_project_members

Пример delete_project_members запроса

?action=delete_project_members&id_project=PROJECT_ID&
members=USER_EMAIL_1,USER_EMAIL_2
Исключает участников из команды выбранного проекта

Обязательные параметры:
id_project — ID проекта
members — email учасников (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка папок проектов через API: get_project_groups

Пример get_project_groups запроса

?action=get_project_groups
Возвращает данные по всем папкам проектов
Возвращаемые данные:
id — ID папки
title — название папки
type — тип папки:
folder — пользовательская папка (созданная участником аккаунта)
company — папка команды (созданная автоматически после создания команды)
client — тип папки company:
0 — папка внутренней команды компании
1 — папка клиентской команды

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME_1",
            "type": "folder"
        },
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME_2",
            "type": "company",
            "client": 0
        },
        {
            "id": "GROUP_ID",
            "title": "GROUP_NAME_3",
            "type": "company",
            "client": 1
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание папки для проектов через API: add_project_group

Пример add_project_group запроса

?action=add_project_group&title=PROJECT_GROUP
Создает папку для проектов
*при отсутствие папки с аналогичным названием

Обязательные параметры:
title — название папки
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "GROUP_ID",
        "title": "GROUP_NAME",
        "type": "folder"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение истории событий за период времени через API: get_events

Пример get_events запроса

?action=get_events&period=3d
Возвращает данные по выполненным действиям по всем или отдельному проекту за указанный период времени
*что, когда и кем изменено

Советуем использовать вебхуки вместо этого метода (см. детальнее)
Обязательные параметры:
period — период времени, возможные значения (только целые числа):
в минутах 1m..360m, в часах 1h..72h, в днях 1d..30d)

Необязательные параметры:
 id_project — ID проекта
Возвращаемые данные:
action — выполненное действие:
post — создание нового проекта/задания/комментария
update — редактирование параметров проекта/задания/комментария
close — закрытие задания
reopen — переоткрытие задания
delete — удаление комментария
object — объект, над которым произведены указанные в action действия:
type — тип объекта: project, task и comment
id — ID объекта
page — ссылка на объект
date_added — дата и время совершения действия
user_from — пользователь, который совершил действие
new — текущие или обновленные значения параметров
для action = post это названия указанных при создании параметров нового объекта и их значения
для action = update это название параметров, которые изменялись, и их новые значения 
old — название параметров, которые изменялись, и их предыдущие значения (только для action = update) 

Пример JSON ответа
*показан для двух выполненных действий: редактирование комментария и изменение срока завершения задачи

При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "action": "update",
            "object": {
                "type": "comment",
                "id": "COMMENT_ID",
                "page": "/project/PROJECT_ID/TASK_ID/"
            },
            "date_added": "YYYY-MM-DD HH:II",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "new": {
                "text": "TEXT"
            },
            "old": {
                "text": "TEXT"
            }
        },
        {
            "action": "update",
            "object": {
                "type": "task",
                "id": "TASK_ID",
                "page": "/project/PROJECT_ID/TASK_ID/"
            },
            "date_added": "YYYY-MM-DD HH:II",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "new": {
                "date_end": "YYYY-MM-DD"
            },
            "old": {
                "date_end": "YYYY-MM-DD"
            }
        }
    ]
}
Получение списка всех задач аккаунта через API: get_all_tasks

Пример get_all_tasks запроса

?action=get_all_tasks
Возвращает открытые и закрытые задания по всем проектам
*кроме заданий с отложенной публикацией
*для возвращения подзаданий используйте параметр extra=subtasks

Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
archive — задания архивных проектов
filter=active — только открытые задания (фильтр только по закрытым не предусмотрен) 
Возвращаемые данные: 
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указан параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_1",
            "page": "/project/PROJECT_ID/TASK_ID/",
            "status": "done",
            "priority": "0..10",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "user_to": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "project": {
                "id": "PROJECT_ID",
                "name": "PROJECT_NAME",
                "page": "/project/PROJECT_ID/"
            },
            "text": "TASK_TEXT",
            "date_added": "YYYY-MM-DD HH:II",
            "date_start": "YYYY-MM-DD",
            "date_end": "YYYY-MM-DD",
            "date_closed": "YYYY-MM-DD HH:II",
            "time_end": "HH:II",
            "max_time": "50",
            "max_money": "100",
            "tags": {
                "TAG_ID": "TAG_NAME_1",
                "TAG_ID": "TAG_NAME_2"
            },
            "files": [
                {
                    "id": "FILE_ID",
                    "size": "FILE_SIZE",
                    "name": "Example.docx",
                    "page": "/download/FILE_ID"
                }
            ],
            "relations": {
                "to": [
                    {
                        "type": "finish-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "active",
                            "priority": "0..10"
                        }
                    }
                ],
                "from": [
                    {
                        "type": "start-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "done",
                            "priority": "0..10"
                        }
                    }
                ]
            },
            "child": [
                {
                    "id": "SUBTASK_ID",
                    "name": "SUBTASK_NAME_1",
                    "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                    ... ... ...,
                    "child": [
                        {
                         "id": "SUBTASK_ID",
                         "name": "SUBTASK_NAME_2",
                         "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                         ... ... ...
                        }
                    ]
                }
            ]    
        },
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_2",
            "page": "/project/PROJECT_ID/TASK_ID/",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение задач проекта через API: get_tasks

Пример get_tasks запроса

?action=get_tasks&id_project=PROJECT_ID
Возвращает открытые и закрытые задания отдельного проекта
*кроме заданий с отложенной публикацией
*для возвращения подзаданий используйте параметр extra=subtasks


Обязательные параметры:
id_project — ID проекта
Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
subscribers — список подписчиков
filter=active — только открытые задания (фильтр только по закрытым не предусмотрен)
Возвращаемые данные:
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
subscribers — список подписчиков (если в запросе указан параметр extra=subscribers)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указан параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_1",
            "page": "/project/PROJECT_ID/TASK_ID/",
            "status": "done",
            "priority": "0..10",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "user_to": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "text": "TASK_TEXT",
            "date_added": "YYYY-MM-DD HH:II",
            "date_start": "YYYY-MM-DD",
            "date_end": "YYYY-MM-DD",
            "date_closed": "YYYY-MM-DD HH:II",
            "time_end": "HH:II",
            "max_time": "50",
            "max_money": "100",
            "tags": {
                "TAG_ID": "TAG_NAME_1",
                "TAG_ID": "TAG_NAME_2"
            },
            "files": [
                {
                    "id": "FILE_ID",
                    "size": "FILE_SIZE",
                    "name": "Example.docx",
                    "page": "/download/FILE_ID"
                }
            ],
            "subscribers": [
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME_1"
                },
                {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME_2"
                }
            ],
            "relations": {
                "to": [
                    {
                        "type": "finish-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "active",
                            "priority": "0..10"
                        }
                    }
                ],
                "from": [
                    {
                        "type": "start-to-start",
                        "task": {
                            "id": "SUBTASK_ID",
                            "name": "SUBTASK_NAME",
                            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                            "status": "done",
                            "priority": "0..10"
                        }
                    }
                ]
            },
            "child": [
                {
                    "id": "SUBTASK_ID",
                    "name": "SUBTASK_NAME_1",
                    "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                    ... ... ...,
                    "child": [
                        {
                         "id": "SUBTASK_ID",
                         "name": "SUBTASK_NAME_2",
                         "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                         ... ... ...
                        }
                    ]
                }
            ]    
        },
        {
            "id": "TASK_ID",
            "name": "TASK_NAME_2",
            "page": "/project/PROJECT_ID/TASK_ID/",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение отдельной задачи через API: get_task

Пример get_task запроса

?action=get_task&id_task=TASK_ID
Возвращает отдельное задание (открытое или закрытое)
*кроме заданий с отложенной публикацией
*для возвращения задачи вместе с ее подзадачами используйте параметр extra=subtasks


Обязательные параметры:
id_task — ID задания
Необязательные параметры:
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
comments — пять последних комментариев
relations — информация о связях с другими заданиями
subtasks — информация о подзаданиях (в массиве child)
subscribers — список подписчиков
filter=active — только открытые подзадачи (при использовании параметра extra=subscribers)
Фильтр только по закрытым не предусмотрен
Возвращаемые данные:
id — ID задания
name — название задания
page — ссылка на задание
status — состояние (active/done — открытая/закрытая)
priority — приоритет (диапазон значений: 0..10)
user_from и user_to — автор и ответственный по заданию
project — информация о проекте
parent — родительская задача (если в запросе указан ID подзадания)
text — описание задания в текстовом или html формате (если в запросе указан соответствующий параметр extra)
date_added — дата и время создания
date_start — дата старта (если указано)
date_end — дата завершения (если указано)
date_closed — дата и время закрытия
time_end — время завершения (если указано)
max_time и max_money — плановые временные и финансовые затраты (если указаны)
tags — теги задания в формате id: name (если указаны)
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
subscribers — список подписчиков (если в запросе указан параметр extra=subscribers)
relations — информация о связях с другими заданиями (если в запросе указан параметр extra=relations):
from — входящие связи:
type — тип связи finish-to-start/start-to-start
task — информация о связанном задании
to — исходящие связи (аналогично from)
child — информация по подзаданиям (если в запросе указаны ID задачи и параметр extra=subtasks)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

*для задачи

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "text": "TASK_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "date_closed": "YYYY-MM-DD HH:II",
        "time_end": "HH:II",
        "max_time": "25",
        "max_money": "50",
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        },
        "files": [
            {
                "id": "FILE_ID",
                "size": "FILE_SIZE",
                "name": "Example.docx",
                "page": "/download/FILE_ID"
            }
        ],
        "subscribers": [
            {
                 "id": "USER_ID",
                 "email": "USER_EMAIL",
                 "name": "USER_NAME_1"
            },
            {
                 "id": "USER_ID",
                 "email": "USER_EMAIL",
                 "name": "USER_NAME_2"
            }
        ],
        "relations": {
            "to": [
                {
                     "type": "finish-to-start",
                     "task": {
                         "id": "TASK_ID",
                         "name": "TASK_NAME",
                         "page": "/project/PROJECT_ID/TASK_ID/",
                         "status": "active",
                         "priority": "0..10"
                     }
                }
            ],
            "from": [
                {
                     "type": "start-to-start",
                     "task": {
                         "id": "TASK_ID",
                         "name": "TASK_NAME",
                         "page": "/project/PROJECT_ID/TASK_ID/",
                         "status": "done",
                         "priority": "0..10"
                     }
                }
            ]
        },
        "child": [
            {
                "id": "SUBTASK_ID",
                "name": "SUBTASK_NAME_1",
                "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                "status": "active",
                "priority": "0..10",
                "child": [
                    {
                     "id": "SUBTASK_ID",
                     "name": "SUBTASK_NAME_2",
                     "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/",
                     "status": "done",
                     "priority": "0..10"
                    }
                ]
            }
        ]
    }
}
*для подзадачи/под-подзадачи (идентичная структура ответа, только с дополнительным массивом данных parent и без массива child)

{
    "status": "ok",
    "data": {
        "id": "SUB-SUBTASK_ID",
        "name": "SUB-SUBTASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/SUB-SUBTASK_ID/", 
        ... ... ...,
        "project": {
            ... ... ...
        },
        "parent": {
            "id": "SUBTASK_ID",
            "name": "SUBTASK_NAME",
            "page": "/project/PROJECT_ID/SUBTASK_ID/",
            "status": "active",
            "priority": "0..10",
            "parent": {
                "id": "TASK_ID",
                "name": "TASK_NAME",
                "page": "/project/PROJECT_ID/TASK_ID/",
                "status": "active",
                "priority": "0..10",
            }
        },
        "text": ...,
        ... ... ...
        "relations": {
            ... ... ...
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание задачи через API: post_task

Пример post_task запроса

?action=post_task&id_project=PROJECT_ID&title=TASK_NAME
Создает (под)задачу в указанном проекте
*позволяет прикреплять файлы (см. детальнее)


Обязательные параметры:
id_project — ID проекта
title — название задания

Необязательные параметры:
id_parent — ID родительской задачи (при создании подзадач) 
email_user_from — email автора задания (автоматически указывается при использовании токена доступа)
email_user_to — email ответственного по заданию, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
priority — приоритет (диапазон значений: 0..10)
text — описание задания
todo⦋⦌ — чекбокс в описании задания (для получения чеклиста используйте следующую логику: todo⦋⦌=текст1&todo⦋⦌=текст2) 
datestart — дата старта в формате DD.MM.YYYY
dateend — дата завершения в формате DD.MM.YYYY
subscribe — email сотрудников (через запятую), которые будут подписаны на задание
hidden — email сотрудников (через запятую), которые будут добавлены в круг видимости задания. Для других сотрудников задание будет скрытым
mention — email сотрудников (через запятую), которые будут упомянуты в конце описания задачи
max_time — плановые временные затраты
max_money — плановые финансовые затраты
tags — теги задания через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_task_tags). Допускаются только теги из наборов, добавленных в проект
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",  
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "text": "TASK_TEXT",
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "max_time": 40,
        "max_money": 200,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2",

        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Редактирование задачи через API: update_task

Пример update_task запроса

?action=update_task&id_task=TASK_ID&email_user_to=USER_EMAIL
Редактирует параметры указанной (под)задачы (открытой или закрытой)


Обязательные параметры:
id_task — ID задания

Необязательные параметры:
email_user_to — email ответственного по заданию, дополнительные возможные значения: ANY – «Любой сотрудник», NOONE или отсутствие значения – «Без ответственного»
priority — приоритет (диапазон значений: 0..10)
title — название задания
datestart — дата старта в формате DD.MM.YYYY
dateend — дата завершения в формате DD.MM.YYYY
dateclosed — дата закрытия в формате DD.MM.YYYY 
max_time — плановые затраты времени
max_money — плановые затраты денег
tags — теги задания через запятую (например: tags=TAG1,TAG2)
Поддерживаются названия тегов (если они уникальны) или их ID (можно получить через метод get_task_tags). Допускаются только теги из наборов, добавленных в проект.
Переданные теги перезаписывают ранее установленные. Для выборочного добавления или снятия тегов используйте метод update_task_tags

Недоступные к редактированию параметры:
email_user_from — email автора задания
text — описание задания
todo — чеклист
subscribe — участники, которые будут подписаны на задание
hidden — участники, у которых будет доступ к заданию
tags — теги задания (можно обновить через отдельный метод update_task_tags)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "TASK_ID",
        "name": "TASK_NAME",
        "page": "/project/PROJECT_ID/TASK_ID/",
        "status": "active",
        "priority": "0..10",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "user_to": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        },
        "project": {
            "id": "PROJECT_ID",
            "name": "PROJECT_NAME",
            "page": "/project/PROJECT_ID/"
        },
        "date_added": "YYYY-MM-DD HH:II",
        "date_start": "YYYY-MM-DD",
        "date_end": "YYYY-MM-DD",
        "max_time": 40,
        "max_money": 200,
        "tags": {
            "TAG_ID": "TAG_NAME_1",
            "TAG_ID": "TAG_NAME_2"
        }
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Закрытие задачи через API: complete_task

Пример complete_task запроса

?action=complete_task&id_task=TASK_ID
Закрывает указанную (под)задачу


Обязательные параметры:
id_task — ID задания
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Повторное открытие задачи через API: reopen_task

Пример reopen_task запроса

?action=reopen_task&id_task=TASK_ID
Повторно открывает указанную (под)задачу


Обязательные параметры:
id_task — ID задания
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Поиск задач через API: search_tasks

Пример search_tasks запроса

?action=search_tasks&id_project=PROJECT_ID&filter=(name has 'Report' or
name has 'Approval') and (dateend>'25.05.2021' and dateend<'31.05.2021')
Возвращает задания, которые удовлетворяют поисковому запросу

Условные параметры:
*обязателен минимум один из них
id_project — ID проекта
id_task — ID задания
email_user_from — email автора задания
email_user_to — email ответственного
filter — поисковый запрос (см. описание ниже)
Необязательные параметры:
status — состояние, возможные значения: active/done — открытое/закрытое
extra — дополнительные данные по заданиям, возможные значения (можно указывать через запятую, например extra=text,files):
text или html — описание в текстовом или html формате
files — информация о файлах, прикрепленных в описание задания
Возможные данные для использования в filter (для метода search_tasks):

Целочисленные поля (Integer):
id=TASK_ID — возвращает определенное задание
project=PROJECT_ID — возвращает задания определенного проекта
parent=TASK_ID — возвращает подзадания определенной родительской задачи
Операторы равенства и диапазона для указанного типа: =, in
project{=}2456
id {in} (1234, 1240)

Строковые поля (String):
name — название задания
Полное или частичное совпадение для указанного типа: =, has
name{=}'Task Report'
name {has} 'Report'

Поля даты:
dateadd — дата создания задания в формате 'DD.MM.YYYY'
datestart — дата старта задания в формате 'DD.MM.YYYY'
dateend — дата завершения задания в формате 'DD.MM.YYYY'
dateclose — дата закрытия задания в формате 'DD.MM.YYYY'
Реляционные операторы для полей даты: >, <, >=, <=, !=, =
dateadd{=}'01.05.2021'


Условия запроса можно объединять скобками ( ) и логическими операциями and, or (только в нижнем регистре)

Пример filter запроса
&filter=(name has 'Report' or name has 'Approval') and
(dateend>'25.05.2021' and dateend<'31.05.2021')
Получение комментариев задания через API: get_comments

Пример get_comments запроса

?action=get_comments&id_task=TASK_ID
Возвращает комментарии выбранного задания

Обязательные параметры:
id_task — ID задания
Необязательные параметры:
extra=files — информация о прикрепленных файлах
Возвращаемые данные:
text — текст комментария
date_added — дата и время отправки
email — email автора комментария
name — имя и фамилия автора комментария
files — информация о прикрепленных файлах (если в запросе указан параметр extra=files):
id — ID файла (можно использовать в методе download для скачивания по API)
size — размер файла (в байтах)
name — название файла с расширением
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "COMMENT_ID",
            "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/#comCOMMENT_ID",
            "text": "COMMENT_TEXT",
            "date_added": "YYYY—MM—DD HH:II",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "files": [
                {
                    "id": "FILE_ID",
                    "size": "FILE_SIZE",
                    "name": "Example.docx",
                    "page": "/download/FILE_ID"
                }
            ],
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание комментария в задании через API: post_comment

Пример post_comment запроса

?action=post_comment&id_task=TASK_ID&email_user_from=USER_EMAIL&text=TEXT
Создает комментарий в указанном задании
*позволяет прикреплять файлы (см. детальнее)

Обязательные параметры:
id_task — ID задания
Условные параметры:
*обязателен минимум один: text или todo
text — текст комментария
todo⦋⦌ — чекбокс (для получения чеклиста используйте следующую логику: todo⦋⦌=текст1&todo⦋⦌=текст2) 
Необязательные параметры:
email_user_from — email автора комментария (автоматически указывается при использовании токена доступа)
hidden — список email сотрудников (через запятую), которые будут входить в круг видимости комментария. Для других сотрудников комментарий будет скрыт.
mention — список email сотрудников (через запятую), которые будут упомянуты в конце комментария
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": {
        "id": "COMMENT_ID",
        "page": "/project/PROJECT_ID/TASK_ID/SUBTASK_ID/#comCOMMENT_ID",
        "text": "COMMENT_TEXT",
        "date_added": "YYYY—MM—DD HH:II",
        "user_from": {
            "id": "USER_ID",
            "email": "USER_EMAIL",
            "name": "USER_NAME"
        }
    }
}
Получение списка тегов для заданий через API: get_task_tags

Пример get_task_tags запроса

?action=get_task_tags
Возвращает данные по тегам для заданий

Необязательные параметры:
group — фильтр по набору тегов
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_task_tag_groups)
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
статусы всегда видимы и имеют значение public
private — доступен только для внутренних команд компании
Возвращаемые данные:
id — ID тега
title — название тега
group — информация о наборе тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "LABEL_NAME",
            "id": "LABEL_ID",
            "group": {
                "title": "GROUP_NAME",
                "id": GROUP_ID,
                "type": "label",
                "access": "public"
                 }
        },
        {
            "title": "STATUS_NAME",
            "id": "STATUS_ID",
            "group": {
                "title": "GROUP_NAME",
                "id": GROUP_ID,
                "type": "status",
                "access": "public"
             }
        }
    ]
}

Эта статья была вам полезна? Да, спасибо! Нет
Создание тегов для заданий через API: add_task_tags

Пример add_task_tags запроса

?action=add_task_tags&title=LABEL_NAME_1,LABEL_NAME_2&group=GROUP_ID
Создает теги для заданий в выбранном наборе тегов
*при отсутствие тегов с аналогичным названием

Обязательные параметры:
group — набор тегов, в котором необходимо создать теги
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_task_tag_groups)
title — названия тегов (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "LABEL_NAME_1",
            "id": LABEL_ID
        },
        {
            "title": "LABEL_NAME_2",
            "id": LABEL_ID
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Установка/снятие тегов у задания через API: update_task_tags

Пример update_task_tags запроса

?action=update_task_tags&id_task=TASK_ID&plus=Tag1,Tag2&minus=Tag3,Tag4
Установка новых и снятие старых тегов у выбранного задания

Обязательные параметры:
id_task — ID задания

Необязательные параметры:
*теги можно указывать по их названиям (полное совпадение) или ID (можно получить через метод get_task_tags)
plus — список тегов (через запятую), которые необходимо установить
minus — список тегов (через запятую), которые необходимо снять 
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}

Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наборов тегов для заданий через API: get_task_tag_groups

Пример get_task_tag_groups запроса

?action=get_task_tag_groups
Возвращает данные по наборам тегов для заданий

Необязательные параметры:
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
статусы всегда видимы и имеют значение public
private — доступен только для внутренних команд компании
Возвращаемые данные: 
id — ID набора тегов
title — название набора тегов
type — типа набора тегов
access — видимость набора тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_3",
            "id": GROUP_ID,
            "type": "label",
            "access": "private"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание наборов тегов для заданий через API: add_task_tag_groups

Пример add_task_tag_groups запроса

?action=add_task_tag_groups&title=GROUP_NAME_1,GROUP_NAME_2&
type=label&access=public
Создает набор тегов для заданий
*при отсутствие наборов с аналогичным названием

Обязательные параметры:
title — названия наборов тегов (через запятую)
type — тип набора тегов, возможные значения: status, label  
access — видимость набора тегов (статусы всегда видимы и имеют значение public)
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка тегов для проектов через API: get_project_tags

Пример get_project_tags запроса

?action=get_project_tags
Возвращает данные по тегам для проектов

Необязательные параметры:
group — фильтр по набору тегов
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_project_tag_groups)
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Возвращаемые данные:
id — ID тега
title — название тега
group — информация о наборе тегов

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
        "data": [
            {
                "title": "PROJECT_STATUS_NAME_1",
                "id": "PROJECT_STATUS_ID",
                "group": {          
                    "title": "PROJECT_GROUP_NAME",
                    "id": "PROJECT_GROUP_ID",
                    "type": "status",
                    "access": "public"
            },
            {
                "title": "_PROJECT_LABEL_NAME_2",
                "id": "PROJECT_LABEL_ID",
                "group": {             
                    "title": "PROJECT_GROUP_NAME",
                    "id": "PROJECT_GROUP_ID",
                    "type": "label",
                    "access": "public"
            }
        ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание тегов для проектов через API: add_project_tags

Пример add_project_tags запроса

?action=add_project_tags&title=PROJECT_LABEL_NAME_1,PROJECT_LABEL_NAME_2&
group=PROJECT_GROUP_ID
Создает теги для проектов в выбранном наборе тегов
*при отсутствие тегов с аналогичным названием

Обязательные параметры:
group — набор тегов, в котором необходимо создать теги
Можно указывать название набора или ID набора (можно получить через этот же метод в возвращенном массиве group или через метод get_project_tag_groups)
title — названия тегов (через запятую)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{ 
    "status": "ok",
    "data": [
        {
            "title": "PROJECT_LABEL_NAME_1",
            "id": PROJECT_LABEL_ID
        },
        {
            "title": "PROJECT_LABEL_NAME_2",
            "id": PROJECT_LABEL_ID
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Установка/снятие тегов у проекта через API: update_project_tags

Пример update_project_tags запроса

?action=update_project_tags&id_project=PROJECT_ID&
plus=Tag1,Tag2&minus=Tag3,Tag4
Установка новых и снятие старых тегов у выбранного проекта

Обязательные параметры:
id_project — ID проекта

Необязательные параметры:
*теги можно указывать по их названиям (полное совпадение) или ID (можно получить через метод get_project_tags)
plus — список тегов (через запятую), которые необходимо установить
minus — список тегов (через запятую), которые необходимо снять 
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok",
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение списка наборов тегов для проектов через API: get_project_tag_groups

Пример get_project_tag_groups запроса

?action=get_project_tag_groups
Возвращает данные по проектным наборам тегов

Необязательные параметры:
type — фильтр по типу набора тегов, возможные значения: status, label
access — фильтр по видимости набора тегов, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Возвращаемые данные: 
id — ID набора тегов
title — название набора тегов
type — тип набора тегов   
access — видимость набора меток

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "status",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "label",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_3",
            "id": GROUP_ID,
            "type": "label",
            "access": "private"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Создание набора тегов для проектов через API: add_project_tag_groups

Пример add_project_tag_groups запроса

?action=add_project_tag_groups&title=GROUP_NAME_1,GROUP_NAME_2&
type=label&access=public
Создает проектные наборы тегов
*при отсутствие наборов с аналогичным названием

Обязательные параметры:
title — названия наборов меток (через запятую)  
access — видимость набора меток, возможные значения:
public — доступен всем командам (в том числе клиентским)
private — доступен только для внутренних команд компании
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "title": "GROUP_NAME_1",
            "id": GROUP_ID,
            "type": "",
            "access": "public"
        },
        {
            "title": "GROUP_NAME_2",
            "id": GROUP_ID,
            "type": "",
            "access": "public"
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! 
Получение затрат времени и денег по заданиям через API: get_costs

Пример get_costs запроса

?action=get_costs
Возвращает временные и финансовые затраты для выбранных или всех заданий

Необязательные параметры:
id_project — ID проекта (затраты по заданиям определенного проекта)
id_task — ID задания (затраты определенного задания)
datestart и dateend — диапазон дат для поиска данных в формате DD.MM.YYYY (даты считаются включительно)
is_timer — тип временных затрат, возможные значения:
1 — внесено с таймера
0 — внесено вручную
filter — дополнительный параметр поиска (список операторов для работы с используемыми в filter данными см. search_tasks) 

Возможные данные для использования в filter (для метода get_costs):
id=TASK_ID — затраты определенного задания (тип Integer)
project=PROJECT_ID — затраты по заданиям определенного проекта (тип Integer)
comment — комментарий пользователя к затратам (тип String)
dateadd — дата внесения затрат в формате 'DD.MM.YYYY' (тип String)
Возвращаемые данные:
id — ID строки затрат
comment — комментарий пользователя к затратам
time — значение временных затрат
money — значение финансовых затрат
date — дата внесения затрат
is_timer — тип временных затрат
true — получены с таймера
false — внесены вручную
user_from — пользователь, за которыми закреплены затраты
task — задание, куда внесены затраты (значения параметров аналогичны описанным в методе get_task)
total — суммарные значения временных и финансовых затрат по всем строкам затрат, полученным в ответе

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "COSTS_ID_1",
            "comment": "COSTS_COMMENT",
            "time": "10:00",
            "money": "100.00",
            "date": "YYYY-MM-DD",
            "is_timer": false,
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "task": {
                "id": "TASK_ID",
                "name": "TASK_NAME",
                "page": "/project/PROJECT_ID/TASK_ID/",
                "status": "active",
                "priority": "0..10",
                "user_from": {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "user_to": {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "project": {
                    "id": "PROJECT_ID",
                    "name": "PROJECT_NAME",
                    "page": "/project/PROJECT_ID/"
                }, 
                "date_added": "YYYY-MM-DD HH:II",
                "date_start": "YYYY-MM-DD",
                "date_end": "YYYY-MM-DD",
                "time_end": "HH:II",
                "max_time": 20,
                "max_money": 500,
                "tags": {
                    "TAG_ID": "TAG_NAME_1",
                    "TAG_ID": "TAG_NAME_2",
                }
            },
   
        },
        {
            "id": "COSTS_ID_2",
            "comment": "COMMENT_COSTS",
            ... ... ...
        }
    ],
    "total": {
        "time": "HH:II",
        "money": "10.01"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение суммарных затрат времени и денег через API: get_costs_total

Пример get_costs_total запроса

?action=get_costs_total
Возвращает суммарные временные и финансовые затраты по проектам или заданию

Необязательные параметры:
id_project — ID проекта (суммарные затраты определенного проекта)
id_task — ID задания (суммарные затраты определенного задания)
datestart и dateend — диапазон дат для поиска данных в формате DD.MM.YYYY (даты считаются включительно)
is_timer — тип временных затрат, возможные значения:
1 — внесено с таймера
0 — внесено вручную
filter — фильтр для получения данных по нескольким проектам (см. описание ниже)
extra=projects — добавляет сводные и помесячные затраты по каждому проекту выборки (по конкретному проекту или нескольким проектам при использовании id_project или filter, либо по всем проектам при отсутствии параметров выбора проекта). Параметр игнорируется при использовании id_task
extra — дополнительные данные, возможные значения (можно указывать через запятую, например extra=projects,tasks):
projects — суммарные и помесячные затраты по каждому проекту выборки (по конкретному проекту или нескольким проектам при использовании id_project или filter, либо по всем проектам при отсутствии параметров выбора проекта). Параметр игнорируется при использовании id_task
tasks или tasks_top_level — суммарные затраты по каждой задаче и подзадаче или только по задачам, но с учетом подзадач. Работают только вместе с параметром projects
Доступные значения для filter (для метода get_costs_total)

Фильтр по ID
project=2456
Фильтр по диапазону ID
project in (1234, 1240)
Объдинение фильтров
*через скобки ( ) и операторы and, or (должны быть в нижнем регистре)
(project=2456 and project=2464) or project in (2450, 2470)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

*без extra=projects
{
    "status": "ok",
    "total": {
        "time": "30:00",
        "money": "300.00",
    }
}
*c extra=projects
{
    "status": "ok",
    "projects": {
        "PROJECT_ID_1": {
            "time": "10:00",
            "money": "100.00",
            "monthly": {
                "2024-04": {
                    "time": "2:00",
                    "money": "20.00"
                },
                "2024-03": {
                    "time": "8:00",
                    "money": "80.00"
                },
                ... ... ...
            },
            "id": "PROJECT_ID_1",
            "name": "PROJECT_NAME_1",
            "page": "/project/PROJECT_ID_1/"
        },
        "PROJECT_ID_2": {
            ... ... ...
        },
        ... ... ...
    },
    "total": {
        "time": "30:00",
        "money": "300.00"
    }
}
*с extra=projects,tasks
{
    "status": "ok",
    "projects": {
        "PROJECT_ID_1": {
            "time": "10:00",
            "money": "100.00",
            "monthly": {
                "2024-04": {
                    "time": "2:00",
                    "money": "20.00"
                },
                ... ... ...
            },
            "tasks": {
                "TASK_ID": {
                    "id": "TASK_ID",
                    "name": "TASK_NAME_1",
                    "page": "/project/PROJECT_ID_1/TASK_ID/",
                    "status": "done",
                    "priority": "0..10",
                    "time": "1:00",
                    "money": "10.00",
                },
                "SUBTASK_ID": {
                    ... ... ...
                },
            },
            "id": "PROJECT_ID_1",
            "name": "PROJECT_NAME_1",
            "page": "/project/PROJECT_ID_1/"
        },
        "PROJECT_ID_2": {
            ... ... ...
        },
        ... ... ...
    },
    "total": {
        "time": "30:00",
        "money": "300.00"
    }
}
Эта статья была вам полезна? Да, спасибо! Нет
Добавление временных и финансовых затрат в задание через API: add_costs

Пример add_costs запроса

?action=add_costs&id_task=TASK_ID&time=TIME
Добавляет затраты в указанное задание

Обязательные параметры:
id_task — ID задания

Условные параметры:
*обязателен минимум один: time или money
time —  временные затраты в одном из форматов 0.15 / 0,15 / 0:09
money — финансовые затраты в валюте аккаунта (если необходимо указать без привязки к почасовой ставке)

Необязательные параметры:
email_user_from — email пользователя, за которым будут значиться затраты (автоматически указывается при использовании токена доступа)
обязательный при использовании админского токена
is_rate=1 — финансовые затраты рассчитываются исходя из почасовой ставки (параметр money игнорируется)
comment — комментарий к затратам 
date — дата внесения затрат в формате DD.MM.YYYY
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и id строки затрат:

{
    "status": "ok",
    "id": "COSTS_ID"
}
Эта статья была вам полезна? Да, спасибо! Нет
Обновление временных и финансовых затрат задания через API: update_costs

Пример update_costs запроса

?action=update_costs&id=ID_COSTS&time=2
Редактирует затраты задания

Обязательные параметры:
id_costs — ID строки затрат (можно получить через метод get_costs)

Необязательные параметры:
time — временные затраты в одном из форматов 0.15 / 0,15 / 0:09
money — финансовые затраты в валюте аккаунта (если необходимо указать без привязки к почасовой ставке)
is_rate=1 — финансовые затраты считаются исходя из почасовой ставки, если указано новое значение time (параметр money игнорируется)
comment — комментарий к затратам
date — дата внесения затрат в формате DD.MM.YYYY

Недоступные к редактированию параметры:
email_user_from — email пользователя, за которым значатся внесенные затраты
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Удаление временных и финансовых затрат задания через API: delete_costs

Пример delete_costs запроса

?action=delete_costs&id=COSTS_ID
Удаляет указанную строку затрат задания

Обязательные параметры:
id_costs — ID строки затрат (можно получить через метод get_costs)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok 

{
    "status": "ok"
}
Получение списка активных таймеров через API: get_timers

Пример get_timers запроса

?action=get_timers
Возвращает информацию по запущенным таймерам
*ID таймера, время запуска, время таймера и кто его запустил
Возвращаемые данные:
id — ID таймера
time — количество времени по таймеру (на момент отправки запроса)
date_started — дата и время запуска таймера
user_from — пользователь, запустивший таймер
task — данные о проекте и задаче, где запущен таймер (возвращаемые данные аналогичны полученным через метод get_task)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "TIMER_ID",
            "time": "HH:II:SS",
            "date_started": "YYYY—MM—DD HH:II",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            },
            "task": {
                "id": "TASK_ID",
                "name": "TASK_NAME",
                "page": "/project/PROJECT_ID/TASK_ID/",
                "status": "active",
                "priority": "1",
                "user_from": {
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "user_to": {
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "project": {
                    "id": "PROJECT_ID",
                    "name": "PROJECT_NAME",
                    "page": "/project/PROJECT_ID/"
                },
                "text": "TASK_TEXT",
                "date_added": "YYYY—MM—DD HH:II",
                "date_start": "YYYY—MM—DD",
                "date_end": "YYYY—MM—DD",
                "time_end": "HH:II",
                "max_time": 20,
                "max_money": 500,
                "tags": {
                    "TAG_ID": "TAG_NAME_1",
                    "TAG_ID": "TAG_NAME_2" 
                }
            }
        },
        {
            "id": "TIMER_ID",
            "time": "HH:II:SS",
            ... ... ...
        }
    ]
}

Эта статья была вам полезна? Да, спасибо! Нет
Остановка запущенного таймера через API: stop_timer

Пример stop_timer запроса

?action=stop_timer&timer=TIMER_ID
Останавливает и сохраняет выбранный запущенный таймер

Обязательные параметры:
timer — ID таймера (можно получить через метод get_timers)
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Получение активного таймера авторизованного пользователя через API: get_my_timer

Пример get_my_timer запроса

?action=get_my_timer
Возвращает информацию по активному таймеру авторизованного пользователя (oauth2)

метод доступен только при использовании токена доступа
Возвращаемые данные:
time — количество времени по таймеру (на момент отправки запроса)
date_started — дата и время запуска таймера
task — данные о проекте и задаче, где запущен таймер (возвращаемые данные аналогичны полученным через метод get_task)

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "time": TIMER_VALUE,
            "date_started": "YYYY—MM—DD HH:II",
            "task": {
                "id": "TASK_ID",
                "name": "TASK_NAME",
                "page": "/project/PROJECT_ID/TASK_ID/",
                "status": "active",
                "priority": "1",
                "user_from": {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "user_to": {
                    "id": "USER_ID",
                    "email": "USER_EMAIL",
                    "name": "USER_NAME"
                },
                "project": {
                    "id": "PROJECT_ID",
                    "name": "PROJECT_NAME",
                    "page": "/project/PROJECT_ID/"
                },
                "date_added": "YYYY—MM—DD HH:II"
            }
        }
    ]
}

Эта статья была вам полезна? Да, спасибо! Нет
Запуск таймера авторизованного пользователя через API: start_my_timer

Пример start_my_timer запроса

?action=start_my_timer&id_task=TASK_ID
Запускает таймер авторизованного пользователя (oauth2) в указанном задании

метод доступен только при использовании токена доступа

Обязательные параметры:
id_task — ID задания
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok:

{
    "status": "ok"
}
Эта статья была вам полезна? Да, спасибо! Нет
Остановка таймера авторизованного пользователя через API: stop_my_timer

Пример stop_my_timer запроса

?action=stop_my_timer
Останавливает и сохраняет активный таймер авторизованного пользователя (oauth2)

метод доступен только при использовании токена доступа

Необязательные параметры:
comment — комментарий к сохраненному таймеру
Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok:

{
    "status": "ok"
}
Получение списка файлов через API: get_files

Пример get_files запроса

?action=get_files&id_project=PROJECT_ID
Возвращает список файлов указанного проекта или задания
*файлы проекта – из описания проекта и добавленные непосредственно в раздел Файлы
*файлы задания – из описания задания и из комментариев

Обязательные параметры:
id_project — ID проекта (становится необязательным при указании ID задания)
Необязательные параметры:
id_task — ID задания
Возвращаемые данные:
id — ID файла
page — часть ссылки для скачивания напрямую (для полного пути перед полученным значением укажите адрес вашего аккаунта, например https://youraccount.worksection.com/download/123456)
name — название файла с расширением
size — размер файла (в байтах)
date_added — дата и время добавления
user_from — кем добавлен файл

Пример JSON ответа
При успешном выполнении запроса, ответ будет содержать статус ok и следующие данные:

{
    "status": "ok",
    "data": [
        {
            "id": "FILE_ID",
            "page": "/download/FILE_ID",
            "name": "Example.docx",
            "size": "FILE_SIZE",
            "date_added": "YYYY—MM—DD HH:II",
            "user_from": {
                "id": "USER_ID",
                "email": "USER_EMAIL",
                "name": "USER_NAME"
            }
        },
        {
            "id": "FILE_ID",
            "page": "/download/FILE_ID",
            ... ... ...
        }
    ]
}
Эта статья была вам полезна? Да, спасибо! Нет
Скачивание файлов через API: download

Пример download запроса:

?action=download&id_file=FILE_ID
Скачивает выбранный файл
*прикрепленный в описании проекта, описании задания, комментарии или напрямую в разделе Файлы

Обязательные параметры:
id_file — ID файла (можно получить через метод get_files)
Эта статья была вам полезна? Да, спасибо! Нет
Как добавлять файлы к проектам, задачам и комментариям через API

Для добавления файлов используйте POST запросы, каждый файл в котором передается как параметр с именем attach[n], где n - любое начальное число (см. пример кода ниже).

Методы, в которых можно добавлять файлы:
post_project — создание проекта
post_task — создание задания
post_comment — создание комментария
Пример добавления файлов в запросе на создание задачи post_task, используя для примера PHP (curl): 
 
$curl = curl_init();
curl_setopt($curl, CURLOPT_URL,'https://youraccount.worksection.com/api/admin/
v2/?action=post_task&id_project=PROJECT_ID&title=TASK_NAME&hash=HASH');
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
curl_setopt($curl, CURLOPT_POST, true);
curl_setopt($curl, CURLOPT_POSTFIELDS, [
  'attach[0]' = new cURLFile('path_to_file/local_file1.pdf',
'application/pdf','nice_name1.pdf'),
  'attach[1]' = new cURLFile('path_to_file/local_file2.pdf',
'application/pdf','nice_name2.pdf'),
]);
$response = json_decode(curl_exec($curl), true);
curl_close($curl);
Вебхуки — это удобный инструмент, который позволяет получать уведомления об изменениях в Worksection без необходимости постоянных запросов к API.
При возникновении определенных изменений в вашем аккаунте автоматически отправляется небольшой пакет данных на указанную вами HTTP-точку назначения. Вебхуки оповещают о событиях аккаунта, а не пользователя. Также можно подписаться на различные типы событий и указать проекты, по которым вы вы хотите получать данные.


Эта статья была вам полезна? Да, спасибо! Нет
Создание вебхука

Для создания вебхука зайдите в настройки аккаунта в раздел API. 
В поле Мои вебхуки нажмите Создать.



Введите URL, который будет принимать запросы вебхука.
Он должен возвращать следующий http-ответ: (HTTP status: 200, Header: JSON, Body: {“status”: ​“OK”}) на любой запрос за время до 5 секунд, иначе этот запрос будет считаться ошибочным.
Выберите события, по которым будут отправляться запросы на указанный URL.
Выберите произвольное количество проектов, по которым будут отправляться события. По умолчанию события будут отправляться по всем проектам.
При необходимости укажите http user, http password для подключения через basic access authentication.
Проверьте валидность вашего URL — нажмите кнопку Тест. 


Для подтверждения нажмите кнопку Создать.
Эта статья была вам полезна? Да, спасибо! Нет
Дополнительные настройки вебхука

По умолчанию созданный вебхук будет выключенным. Когда будет нужно – включите его вручную: 


Если указанный URL окажется невалидным, то при включении появится ошибка: 



При необходимости вебхук можно отключить и удалить. 



Вебхук может находиться в трех статусах: 
Серый – ​“Выключенный”
Зеленый – ​“Работает”
Оранжевый – ​“Работает, но имеет неудачные попытки” 
​
Если произойдет 10 ошибок – вебхук будет автоматически выключен. 
Эта статья была вам полезна? Да, спасибо! Нет
Типы событий вебхука

СОБЫТИЕ
ОПИСАНИЕ
Создание задачи	Запускается, когда пользователь создает новую задачу
Редактирование задачи	Запускается при изменении задачи
Выполнение задачи	Запускается, когда задача меняет статус на ​“выполнена”
Удаление задачи	Запускается при удалении задачи
Создание комментария	Запускается, когда пользователь создает новый комментарий
Редактирование комментария	Запускается при изменении комментария
Удаление комментария	Запускается при удалении комментария
Создание проекта	Запускается, когда пользователь создает новый проект
Редактирование проекта	Запускается при изменении проекта
Эта статья была вам полезна? Да, спасибо! Нет
Пример использования вебхука

Включенный вебхук выглядит так:



При создании проекта на указанный URL прийдет следующее событие:


Эта статья была вам полезна? Да, спасибо! Нет
Получение вебхуков через API: get_webhooks

Метод get_webhooks может быть выполнен с использованием ключа административного API: 
https://youraccount.worksection.com/api/admin/v2/?action=get_webhooks&hash=HASH
или же с использованием OAuth 2.0 токена с scope = administrative:
curl -X GET -H "Authorization: Bearer <token_value>"
https://youraccount.worksection.com/api/oauth2?action=get_webhooks
Пример ответа:
{
    "status": "ok",
    "data": [
        {
            "id": "14",
            "url": "https://eoaerzysr8s23hq.m.pipedream.net",
            "events": "post_task,delete_task,reopen_task",
            "status": "active",
            "projects": "333"
        },
        {
            "id": "16",
            "url": "https://eolb4pffb2s43u.m.pipedream.net",
            "events": "post_task,post_comment,post_project",
            "status": "paused"
        }
    ]}
    Postman 
Что такое Postman
Импорт Worksection коллекции в Postman
Что такое Postman

Postman — это инструмент для разработки и тестирования веб-сервисов API. Он позволяет разработчикам создавать, тестировать, документировать и общаться с API путем отправки HTTP-запросов к серверам и анализа ответов.
Эта статья была вам полезна? Да, спасибо! Нет
Импорт Worksection коллекции в Postman

Доступные Worksection коллекции: 
API методы
OAuth2 методы
​
Зайдите на сайт Postman и зарегистрируйтесь.
Перейдите на страницу нужной коллекции и нажмите кнопку
Run in Postman.
​После этого выбранная коллекция методов будет импортирована в ваш Postman. 

Также вы можете скачать json-файлы коллекций с нашего Github и импортировать в веб или десктоп версии Postman.