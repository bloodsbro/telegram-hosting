const randomstring = require("randomstring");

import {CallbackQuery, InlineKeyboardButton, Message, User} from "node-telegram-bot-api";
import * as TelegramBot from 'node-telegram-bot-api';
import { db } from './utils/knex';
import {HostingOrder, HostingUser, HostingRate, HostingLocation} from "./interfaces/hosting";
import LangSchema from "../lang/schema";

enum CallbackActions {
  CALLBACK_MY_ORDERS = 'CALLBACK_MY_ORDERS',
  CALLBACK_PAY_BALANCE = 'CALLBACK_PAY_BALANCE',
  CALLBACK_GET_RATES = 'CALLBACK_GET_RATES',
  CALLBACK_SUPPORT = 'CALLBACK_SUPPORT',
  CALLBACK_BUY = 'CALLBACK_BUY',
  CALLBACK_BUY_SELECT_GAME = 'CALLBACK_BUY_SELECT_GAME',
  CALLBACK_EMPTY = 'CALLBACK_EMPTY',
  CALLBACK_CONFIRM_RATE = 'CALLBACK_CONFIRM_RATE',
  CALLBACK_CANCEL = 'CALLBACK_CANCEL',
  CALLBACK_RATE_CONTROL = 'CALLBACK_RATE_CONTROL'
}

interface CallbackData {
  callback: CallbackActions,
  extra?: any | any[];
}

enum MessageState {
  MESSAGE_EMPTY,
  MESSAGE_SLOTS,
  MESSAGE_BALANCE_UP
}

interface Session {
  name: string;
  tgId: number;
  stage: MessageState;
  rate?: number;
  slots?: number;
}

class telegramBot {
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;
  private botInstance: TelegramBot;
  private sessions: Session[] = [];

  constructor() {
    this.botInstance = new TelegramBot(this.token, { polling: true });

    this.handleKeyboard();
    this.start();
  }

  async getUser(tgId: number) {
    return <HostingUser>await db.select('*').from('users').where('user_tg_id', tgId).first();
  }

  async getOrders(userId: number, includeLocation = false): Promise<HostingOrder[] | HostingOrder[] & HostingLocation[]> {
    if(includeLocation) {
      return <HostingOrder[] & HostingLocation[]>await db.select('*').from('servers').innerJoin('locations', 'locations.location_id', 'servers.location_id').where('user_id', userId);
    } else {
      return <HostingOrder[]>await db.select('*').from('servers').where('user_id', userId);
    }
  }

  async getRates(rate: number = -1) {
    if(rate === -1) {
      return <HostingRate[]>await db.select('*').from('games').where('game_status', 1);
    } else {
      return <HostingRate[]>await db.select('*').from('games').where('game_status', 1).andWhere('game_id', rate);
    }
  }

  async getLocations() {
    return <HostingLocation[]>await db.select('*').from('locations').where('location_status', 1);
  }

  completeLang(lang: string, keyLang: keyof LangSchema, ...args: any[]) {
    const langFile: LangSchema = require(`../lang/${lang}`).default;

    let idx = 0;
    return langFile[keyLang].replace(/%s/g, () => args[idx++]);
  }

  keyboard(names: string[], callbacks?: CallbackData[], rows: number = -1) {
    let keyboard: InlineKeyboardButton[][] = [];
    names.forEach((name: string, idx: number) => {
      const row = rows === -1 ? idx : idx % rows;

      if(typeof keyboard[row] === 'undefined') {
        keyboard[row] = [];
      }

      keyboard[row].push({
        text: name,
        callback_data: JSON.stringify(callbacks ? callbacks[idx] ? callbacks[idx] : CallbackActions.CALLBACK_EMPTY : CallbackActions.CALLBACK_EMPTY),
      });
    });

    return keyboard;
  }

  getName(user: User) {
    return `${user.first_name ? user.first_name : ''} ${user.last_name ? user.last_name : ''}`.trim();
  }

  hasSession(tgId: number) {
    return this.getSession(tgId) !== undefined;
  }

  getSession(tgId: number) {
    return this.sessions.find((session) => {
      return session.tgId === tgId;
    });
  }

  getRandomIntInclusive(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  generatePaymentForm(sum: number) {

  }

  async getNewServerPort(minPort: number, maxPort: number) {
    for(let port = minPort; port <= maxPort; port += 2) {
      const isPortTaken = await db.select('server_id').from('servers').where('server_port', port).first();
      if(!isPortTaken) {
        return port;
      }
    }

    return -1;
  }

  async cancel(userId: number, chatId: number, showMenu: boolean) {
    const session = this.getSession(userId);

    session.stage = MessageState.MESSAGE_EMPTY;
    session.rate = undefined;
    session.slots = undefined;

    if(showMenu) {
      await this.menu(chatId, session.tgId, session.name, true);
    }
  }

  getRateStatus(status: number) {
    switch(status) {
      case 1: return 'Выключен';
      case 2: return 'Включен';
      case 3: return 'Устанавливается';
      default: return `unhandled status: ${status}`;
    }
  }

  start() {
    this.botInstance.on('message', async (msg: Message) => {
      if(!this.hasSession(msg.from.id)) {
        this.sessions.push({
          name: this.getName(msg.from),
          tgId: msg.from.id,
          stage: MessageState.MESSAGE_EMPTY,
        });
      }

      const session = this.getSession(msg.from.id);
      switch(session.stage) {
        case MessageState.MESSAGE_SLOTS: {
          const rate = (await this.getRates(this.getSession(msg.from.id).rate))[0];
          const number = parseInt(msg.text);

          if(isNaN(number) || number < rate.game_min_slots || number > rate.game_max_slots) {
            await this.botInstance.sendMessage(msg.chat.id, this.completeLang('ru', 'ENTER_SLOTS', rate.game_name, rate.game_min_slots, rate.game_max_slots), {
              reply_markup: {
                inline_keyboard: [...this.keyboard(['Отмена'], [{ callback: CallbackActions.CALLBACK_CANCEL }])]
              }
            });
          } else {
            session.slots = number;

            await this.botInstance.sendMessage(msg.chat.id, this.completeLang('ru', 'CONFIRM_RATE', rate.game_name, number, rate.game_price * number), {
              reply_markup: {
                inline_keyboard: [
                  ...this.keyboard(['Подтверждаю', 'Отмена'], [
                    { callback: CallbackActions.CALLBACK_CONFIRM_RATE },
                    { callback: CallbackActions.CALLBACK_CANCEL }
                  ])
                ]
              }
            });
          }
          break;
        }

        case MessageState.MESSAGE_BALANCE_UP: {
          const number = parseInt(msg.text);
          if(isNaN(number) || number < 0 || number > 100000) {
            await this.botInstance.sendMessage(msg.chat.id, this.completeLang('ru', 'BALANCE_UP_SUM'), {
              reply_markup: {
                inline_keyboard: [
                  ...this.keyboard(['Отмена'], [{ callback: CallbackActions.CALLBACK_CANCEL }])
                ]
              }
            });
          } else {
            this.generatePaymentForm(number);
          }
          break;
        }

        default: {
          const isExist = await db.select('user_id').from('users').where('user_tg_id', msg.from.id).first();
          if(!isExist) {
            const isUserNameTaken = await db.select('user_id').from('users').where('user_email', msg.from.username).first();

            const password = randomstring.generate();
            const insertId = (await db.insert({
              user_email: !isUserNameTaken ? msg.from.username : msg.from.id,
              user_password: password,
              user_firstname: msg.from.first_name,
              user_lastname: msg.from.last_name,
              user_status: 1,
              user_balance: 0,
              user_access_level: 1,
              user_date_reg: db.fn.now(),
              user_activate: 1,
              user_tg_id: msg.from.id,
            }).into('users'))[0];

            const message = this.completeLang('ru', 'REGISTERED_SUCCESS', session.name, insertId, !isUserNameTaken ? msg.from.username : msg.from.id, password);
            await this.botInstance.sendMessage(msg.chat.id, message);
          }

          await this.menu(msg.chat.id, msg.from.id, session.name, isExist);
          break;
        }
      }
    });
  }

  async menu(chatId: number, userId: number, name: string, repeat = false) {
    const user = await this.getUser(userId);
    const keyboard = this.keyboard(['Мои заказы', 'Доступные тарифы', 'Сделать заказ', 'Пополнить баланс', 'Получить помощь'], [
      {
        callback: CallbackActions.CALLBACK_MY_ORDERS
      },
      {
        callback: CallbackActions.CALLBACK_GET_RATES
      },
      {
        callback: CallbackActions.CALLBACK_BUY
      },
      {
        callback: CallbackActions.CALLBACK_PAY_BALANCE
      },
      {
        callback: CallbackActions.CALLBACK_SUPPORT
      }
    ], 3);

    const message = this.completeLang('ru', repeat ? 'WELCOME' : 'WELCOME_NEW', name, user.user_id, user.user_balance);
    await this.botInstance.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          ...keyboard,
        ],
      },
    })
  }

  handleKeyboard() {
    this.botInstance.on('callback_query', async (callbackQuery: CallbackQuery) => {
      const user = await this.getUser(callbackQuery.from.id);
      const data: CallbackData = JSON.parse(callbackQuery.data);
      const action = data.callback;
      const extra = data.extra;
      const session = this.getSession(callbackQuery.from.id);

      switch(action) {
        case CallbackActions.CALLBACK_PAY_BALANCE: {
          const sum = parseInt(extra);
          if(isNaN(sum) || sum < 0 || sum > 100000) {
            session.stage = MessageState.MESSAGE_BALANCE_UP;

            await this.botInstance.sendMessage(callbackQuery.message.chat.id, this.completeLang('ru', 'BALANCE_UP_SUM'), {
              reply_markup: {
                inline_keyboard: [
                  ...this.keyboard(['Отмена'], [{ callback: CallbackActions.CALLBACK_CANCEL }])
                ]
              }
            });
          } else {
            this.generatePaymentForm(sum);
          }
          break;
        }

        case CallbackActions.CALLBACK_MY_ORDERS: {
          const orders: HostingOrder[] | (HostingOrder[] & HostingLocation[]) = await this.getOrders(user.user_id, true);

          if(orders.length > 0) {
            const callbacks: CallbackData[] = [];
            for(let idx = 0; idx < orders.length; idx ++) {
              callbacks.push({
                callback: CallbackActions.CALLBACK_RATE_CONTROL,
                extra: orders[idx].server_id,
              })
            }

            await this.botInstance.sendMessage(callbackQuery.message.chat.id, `${session.name}, Ваши заказы: 
${
              orders.map((service: HostingOrder & HostingLocation, idx: number) => {
                return `
Услуга #${service.server_id}
От: ${service.server_date_reg.toLocaleString()}
Оплачена до: ${service.server_date_end.toLocaleString()}
Локация: ${service.location_name} [#${service.location_id}]
IP: ${service.location_ip}:${service.server_port}
Статус: ${this.getRateStatus(service.server_status)}
              `;
              })
            }`, {
              reply_markup: {
                inline_keyboard: [...this.keyboard([
                  ...orders.map((service: HostingOrder, idx: number) => {
                    return `Управление услугой #${service.server_id}`;
                  })
                ], callbacks)]
              }
            });
          } else {
            await this.botInstance.sendMessage(callbackQuery.message.chat.id, `${session.name}, у Вас все ещё активных у нас услуг :(`);
          }
          break;
        }

        case CallbackActions.CALLBACK_GET_RATES: {
          const rates = await this.getRates();
          await this.botInstance.sendMessage(callbackQuery.message.chat.id, `${session.name}, для Вас доступны следующие тарифы: ${
            rates.map((rate: HostingRate, idx: number) => {
              return `
Игра: ${rate.game_name}
Слоты: ${rate.game_min_slots} - ${rate.game_max_slots}
Цена: ${rate.game_price}руб / слот
              `
            })
          }
Хотите ещё? Либо скидку? Пишите в поддержку, поможем всем, чем сможем!
`);

          break;
        }

        case CallbackActions.CALLBACK_BUY: {
          const rates = await this.getRates();
          const names = rates.map((rate: HostingRate) => {
            return rate.game_name
          });

          let namesArr: CallbackData[] = [];
          for(let idx = 0; idx < 3; idx ++) {
            namesArr.push({
              callback: CallbackActions.CALLBACK_BUY_SELECT_GAME,
              extra: rates[idx].game_id
            });
          }

          await this.botInstance.sendMessage(callbackQuery.message.chat.id, `Выберите интересующий Вас тариф:`, {
            reply_markup: {
              inline_keyboard: [
                ...this.keyboard(names, namesArr, Math.ceil(names.length / 2))
              ]
            }
          })
          break;
        }

        case CallbackActions.CALLBACK_BUY_SELECT_GAME: {
          const rate: HostingRate = (await this.getRates(extra))[0];

          const minSlots = rate.game_min_slots;
          const maxSlots = rate.game_max_slots;

          const session: Session = this.getSession(callbackQuery.from.id);
          session.stage = MessageState.MESSAGE_SLOTS;
          session.rate = extra;

          await this.botInstance.sendMessage(callbackQuery.message.chat.id, this.completeLang('ru', 'ENTER_SLOTS', rate.game_name, minSlots, maxSlots), {
            reply_markup: {
              inline_keyboard: [...this.keyboard(['Отмена'], [{ callback: CallbackActions.CALLBACK_CANCEL, extra: 1 }])]
            }
          });
          break;
        }

        case CallbackActions.CALLBACK_CANCEL: {
          await this.cancel(callbackQuery.from.id, callbackQuery.message.chat.id, !!extra);
          break;
        }

        case CallbackActions.CALLBACK_CONFIRM_RATE: {
          const rate = (await this.getRates(this.getSession(user.user_tg_id).rate))[0];
          const slots = session.slots;
          const price = rate.game_price * slots;

          if(user.user_balance < price) {
            await this.botInstance.sendMessage(callbackQuery.message.chat.id, this.completeLang('ru', 'NEED_BALANCE_UP', price - user.user_balance), {
              reply_markup: {
                inline_keyboard: [...this.keyboard([`Пополнить баланс на ${price - user.user_balance} руб`, 'Мои заказы'], [{ callback: CallbackActions.CALLBACK_PAY_BALANCE, extra: price - user.user_balance }, { callback: CallbackActions.CALLBACK_MY_ORDERS, extra: 'NOT_PAYED' }])]
              }
            });
          } else {
            const insertId = await this.confirmOrder(user, rate, slots);
            await this.botInstance.sendMessage(callbackQuery.message.chat.id, this.completeLang('ru', 'ORDER_SUCCESS', insertId));
          }

          await this.cancel(callbackQuery.from.id, callbackQuery.message.chat.id, true);
          break;
        }

        case CallbackActions.CALLBACK_RATE_CONTROL: {

          break;
        }
      }

      await this.botInstance.answerCallbackQuery(callbackQuery.id);
    })
  }

  async confirmOrder(user: HostingUser, rate: HostingRate, slots: number) {
    const price = rate.game_price * slots;

    user.user_balance -= price;
    await db('users').update({
      user_balance: user.user_balance
    }).where('user_id', user.user_id);

    const locations = await this.getLocations();
    const allowedLocations: HostingLocation[] = [];

    locations.forEach((location) => {
      const allowedGames = location.location_games.split(' ');
      if(allowedGames.indexOf(rate.game_id.toString()) !== -1) {
        allowedLocations.push(location);
      }
    });

    const selected: HostingLocation = allowedLocations[this.getRandomIntInclusive(0, allowedLocations.length - 1)];
    const port = await this.getNewServerPort(rate.game_min_port, rate.game_max_port);

    return (await db.insert({
      user_id: user.user_id,
      game_id: rate.game_id,
      location_id: selected.location_id,
      server_slots: slots,
      server_port: port,
      server_password: randomstring.generate(),
      server_status: 3,
      server_ssd_load: 0,
      server_ram_cpu_date: 0,
      server_ssd_date: 0,
      server_date_reg: db.fn.now(),
      server_date_end: db.raw('DATE_ADD(NOW(), INTERVAL 31 DAY)'),
      server_work: 1,
      server_binary: '',
      server_binary_version: '',
      server_mysql: 0,
    }).into('servers'))[0];
  }
}

export default new telegramBot();