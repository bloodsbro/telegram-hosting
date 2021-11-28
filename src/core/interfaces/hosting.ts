interface HostingUser {
  user_id: number;
  user_email: string;
  user_password: string;
  user_firstname: string;
  user_lastname: string;
  user_status: number;
  user_balance: number;
  user_restore_key: string;
  user_access_level: string;
  user_date_reg: string;
  user_img: string;
  test_server: number;
  realpass: string;
  user_activate: string;
  user_vk_id: number;
  ref: number;
  rmoney: number;
  key_activate: string;
  user_tg_id: number;
}

interface HostingOrder {
  server_id: number;
  user_id: number;
  game_id: number;
  location_id: number;
  database: number;
  server_slots: number;
  server_port: number;
  server_password: string;
  server_status: number;
  server_cpu_load: number;
  server_ram_load: number;
  server_date_reg: Date;
  server_date_end: Date;
  version: number;
}

interface HostingRate {
  game_id: number;
  game_name: string;
  game_code: string;
  game_query: string;
  image_url: string;
  game_min_slots: number;
  game_max_slots: number;
  game_min_port: number;
  game_max_port: number;
  game_price: number;
  game_status: number;
}

interface HostingLocation {
  location_id: number;
  location_name: string;
  location_ip: string;
  location_ip2: string;
  location_port: number;
  location_user: string;
  location_status: number;
  location_cpu: number;
  location_ram: number;
  location_ramold: number;
  location_swap: number;
  location_swapold: number;
  location_hdd: number;
  location_hddold: number;
  location_upd: Date,
  location_games: string;
  location_password: string;
}


export { HostingRate, HostingOrder, HostingUser, HostingLocation };