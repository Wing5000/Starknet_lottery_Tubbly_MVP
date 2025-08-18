%lang starknet

use starknet::contract::ContractAddress;
use starknet::contract::get_caller_address;
use starknet::block::get_block_number;
use starknet::hash::pedersen;
use starknet::storage::{LegacyMap};

const PPM_DEN: u128 = 1_000_000;

#[starknet::contract]
mod BlockInstantLottery {
    use super::*;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        prize_wei: u256,
        entry_fee_wei: u256,
        win_chance_ppm: u32,
        pending_prizes: LegacyMap<ContractAddress, u256>,
        last_played_block: LegacyMap<ContractAddress, u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Result: Result,
        PrizePaid: PrizePaid,
        PrizePending: PrizePending,
        ParamsUpdated: ParamsUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct Result {
        player: ContractAddress,
        won: bool,
        prize_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct PrizePaid {
        to: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct PrizePending {
        to: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct ParamsUpdated {
        prize_wei: u256,
        entry_fee_wei: u256,
        win_chance_ppm: u32,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        prize_wei: u256,
        entry_fee_wei: u256,
        win_chance_ppm: u32,
    ) {
        self.owner.write(get_caller_address());
        self.prize_wei.write(prize_wei);
        self.entry_fee_wei.write(entry_fee_wei);
        self.win_chance_ppm.write(win_chance_ppm);
    }

    // --- Read ---
    #[external(v0)]
    fn prizeWei(self: @ContractState) -> u256 {
        self.prize_wei.read()
    }

    #[external(v0)]
    fn entryFeeWei(self: @ContractState) -> u256 {
        self.entry_fee_wei.read()
    }

    #[external(v0)]
    fn winChancePpm(self: @ContractState) -> u32 {
        self.win_chance_ppm.read()
    }

    #[external(v0)]
    fn owner(self: @ContractState) -> ContractAddress {
        self.owner.read()
    }

    #[view]
    fn contractBalance(self: @ContractState) -> u256 {
        starknet::contract::contract_balance()
    }

    #[view]
    fn lastPlayedBlock(self: @ContractState, player: ContractAddress) -> u64 {
        self.last_played_block.read(player)
    }

    #[view]
    fn pendingPrizes(self: @ContractState, player: ContractAddress) -> u256 {
        self.pending_prizes.read(player)
    }

    #[view]
    fn nextAllowedBlock(self: @ContractState, player: ContractAddress) -> u64 {
        self.last_played_block.read(player) + 1_u64
    }

    #[view]
    fn canPlayNow(self: @ContractState, player: ContractAddress) -> bool {
        let cur = get_block_number();
        cur >= self.nextAllowedBlock(player)
    }

    // --- Write ---
    #[external(v0)]
    #[payable]
    fn play(ref self: ContractState, user_salt: felt252) -> bool {
        let player = get_caller_address();
        let block = get_block_number();
        let last = self.last_played_block.read(player);
        assert(block > last, 'WAIT');

        // simple on-chain RNG using Pedersen hash
        let h = pedersen(pedersen(player.into(), user_salt), block.into());
        let chance = self.win_chance_ppm.read();
        let won = (h.into() % PPM_DEN) < chance.into();

        self.last_played_block.write(player, block);

        if won {
            let prize = self.prize_wei.read();
            let balance = starknet::contract::contract_balance();
            if balance >= prize {
                starknet::eth::transfer_eth(player, prize);
                self::Event::emit(Result { player, won: true, prize_amount: prize });
                self::Event::emit(PrizePaid { to: player, amount: prize });
            } else {
                let pending = self.pending_prizes.read(player) + prize;
                self.pending_prizes.write(player, pending);
                self::Event::emit(Result { player, won: true, prize_amount: prize });
                self::Event::emit(PrizePending { to: player, amount: prize });
            }
        } else {
            self::Event::emit(Result { player, won: false, prize_amount: 0_u256 });
        }
        won
    }

    #[external(v0)]
    fn claim(ref self: ContractState) {
        let player = get_caller_address();
        let amount = self.pending_prizes.read(player);
        assert(amount > 0_u256, 'NOTHING');
        self.pending_prizes.write(player, 0_u256);
        starknet::eth::transfer_eth(player, amount);
        self::Event::emit(PrizePaid { to: player, amount });
    }

    #[external(v0)]
    #[payable]
    fn fund() {}

    #[external(v0)]
    fn ownerWithdraw(ref self: ContractState, amount: u256) {
        assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');
        starknet::eth::transfer_eth(self.owner.read(), amount);
    }

    #[external(v0)]
    fn setParams(
        ref self: ContractState,
        prize_wei: u256,
        fee_wei: u256,
        win_chance_ppm: u32,
    ) {
        assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');
        self.prize_wei.write(prize_wei);
        self.entry_fee_wei.write(fee_wei);
        self.win_chance_ppm.write(win_chance_ppm);
        self::Event::emit(ParamsUpdated { prize_wei, entry_fee_wei: fee_wei, win_chance_ppm });
    }
}

