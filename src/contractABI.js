export const CONTRACT_ABI = [
  {
    "name": "constructor",
    "type": "constructor",
    "inputs": [
      { "name": "prize_wei", "type": "core::integer::u256" },
      { "name": "entry_fee_wei", "type": "core::integer::u256" },
      { "name": "win_chance_ppm", "type": "core::integer::u32" }
    ]
  },
  {
    "name": "prizeWei",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "prize", "type": "core::integer::u256" }],
    "state_mutability": "view"
  },
  {
    "name": "entryFeeWei",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "fee", "type": "core::integer::u256" }],
    "state_mutability": "view"
  },
  {
    "name": "winChancePpm",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "chance", "type": "core::integer::u32" }],
    "state_mutability": "view"
  },
  {
    "name": "owner",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "owner", "type": "core::starknet::contract_address::ContractAddress" }],
    "state_mutability": "view"
  },
  {
    "name": "contractBalance",
    "type": "function",
    "inputs": [],
    "outputs": [{ "name": "balance", "type": "core::integer::u256" }],
    "state_mutability": "view"
  },
  {
    "name": "get_user_last_played_block",
    "type": "function",
    "inputs": [{ "name": "user", "type": "core::starknet::contract_address::ContractAddress" }],
    "outputs": [{ "name": "block", "type": "core::integer::u64" }],
    "state_mutability": "view"
  },
  {
    "name": "get_pending_prizes",
    "type": "function",
    "inputs": [{ "name": "user", "type": "core::starknet::contract_address::ContractAddress" }],
    "outputs": [{ "name": "amount", "type": "core::integer::u256" }],
    "state_mutability": "view"
  },
  {
    "name": "get_can_play",
    "type": "function",
    "inputs": [{ "name": "user", "type": "core::starknet::contract_address::ContractAddress" }],
    "outputs": [{ "name": "can_play", "type": "core::bool" }],
    "state_mutability": "view"
  },
  {
    "name": "get_next_allowed_block",
    "type": "function",
    "inputs": [{ "name": "user", "type": "core::starknet::contract_address::ContractAddress" }],
    "outputs": [{ "name": "block", "type": "core::integer::u64" }],
    "state_mutability": "view"
  },
  {
    "name": "play",
    "type": "function",
    "inputs": [{ "name": "user_salt", "type": "core::felt252" }],
    "outputs": [{ "name": "won", "type": "core::bool" }],
    "state_mutability": "external"
  },
  {
    "name": "claim",
    "type": "function",
    "inputs": [],
    "outputs": [],
    "state_mutability": "external"
  },
  {
    "name": "fund",
    "type": "function",
    "inputs": [],
    "outputs": [],
    "state_mutability": "external"
  },
  {
    "name": "ownerWithdraw",
    "type": "function",
    "inputs": [{ "name": "amount", "type": "core::integer::u256" }],
    "outputs": [],
    "state_mutability": "external"
  },
  {
    "name": "setParams",
    "type": "function",
    "inputs": [
      { "name": "_prizeWei", "type": "core::integer::u256" },
      { "name": "_feeWei", "type": "core::integer::u256" },
      { "name": "_winChancePpm", "type": "core::integer::u32" }
    ],
    "outputs": [],
    "state_mutability": "external"
  },
  {
    "name": "Result",
    "type": "event",
    "members": [
      { "name": "player", "type": "core::starknet::contract_address::ContractAddress", "kind": "key" },
      { "name": "won", "type": "core::bool", "kind": "data" },
      { "name": "prize_amount", "type": "core::integer::u256", "kind": "data" }
    ]
  },
  {
    "name": "PrizePaid",
    "type": "event",
    "members": [
      { "name": "to", "type": "core::starknet::contract_address::ContractAddress", "kind": "key" },
      { "name": "amount", "type": "core::integer::u256", "kind": "data" }
    ]
  },
  {
    "name": "PrizePending",
    "type": "event",
    "members": [
      { "name": "to", "type": "core::starknet::contract_address::ContractAddress", "kind": "key" },
      { "name": "amount", "type": "core::integer::u256", "kind": "data" }
    ]
  }
];
