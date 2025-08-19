use starknet::contract_address::ContractAddress;
use starknet::context::get_caller_address;
use starknet::info::get_block_number;
use starknet::hash::pedersen;
use starknet::storage::Map;

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
        pending_prizes: Map<ContractAddress, u256>,
        last_played_block: Map<ContractAddress, u64>,
    }

    #[event]
    #[derive(starknet::Event)]
    enum Event {
        Result(Result),
        PrizePaid(PrizePaid),
        PrizePending(PrizePending),
        ParamsUpdated(ParamsUpdated),
    }

    #[derive(starknet::Event)]
    struct Result {
        player: ContractAddress,
        won: bool,
        prize_amount: u256,
    }

    #[derive(starknet::Event)]
    struct PrizePaid {
        to: ContractAddress,
        amount: u256,
    }

    #[derive(starknet::Event)]
    struct PrizePending {
        to: ContractAddress,
        amount: u256,
    }

    #[derive(starknet::Event)]
    struct ParamsUpdated {
        prize_wei: u256,
        entry_fee_wei: u256,
        win_chance_ppm: u32,
    }

    #[constructor]
    fn constructor(ref self: ContractState, prize_wei: u256, entry_fee_wei: u256, win_chance_ppm: u32) {
        self.owner.write(get_caller_address());
        self.prize_wei.write(prize_wei);
        self.entry_fee_wei.write(entry_fee_wei);
        self.win_chance_ppm.write(win_chance_ppm);
    }

    // --- Read ---
    #[external]
    fn prizeWei(self: @ContractState) -> u256 { self.prize_wei.read() }

    #[external]
    fn entryFeeWei(self: @ContractState) -> u256 { self.entry_fee_wei.read() }

    #[external]
    fn winChancePpm(self: @ContractState) -> u32 { self.win_chance_ppm.read() }

    #[external]
    fn owner(self: @ContractState) -> ContractAddress { self.owner.read() }

    #[external]
    fn contractBalance(self: @ContractState) -> u256 { starknet::contract::contract_balance() }

    #[external]
    fn lastPlayedBlock(self: @ContractState, player: ContractAddress) -> u64 { self.last_played_block.read(player) }

    #[external]
    fn pendingPrizes(self: @ContractState, player: ContractAddress) -> u256 { self.pending_prizes.read(player) }

    #[external]
    fn nextAllowedBlock(self: @ContractState, player: ContractAddress) -> u64 { self.last_played_block.read(player) + 1_u64 }

    #[external]
    fn canPlayNow(self: @ContractState, player: ContractAddress) -> bool {
        let cur = get_block_number();
        cur >= self.nextAllowedBlock(player)
    }

    // --- Write ---
    #[external]
    #[payable]
    fn play(ref self: ContractState, user_salt: felt252) -> bool {
        let player = get_caller_address();
        let block = get_block_number();
        let last = self.last_played_block.read(player);
        assert(block > last, 'WAIT');

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

    #[external]
    fn claim(ref self: ContractState) {
        let player = get_caller_address();
        let amount = self.pending_prizes.read(player);
        assert(amount > 0_u256, 'NOTHING');
        self.pending_prizes.write(player, 0_u256);
        starknet::eth::transfer_eth(player, amount);
        self::Event::emit(PrizePaid { to: player, amount });
    }

    #[external]
    #[payable]
    fn fund(ref self: ContractState) {}

    #[external]
    fn ownerWithdraw(ref self: ContractState, amount: u256) {
        assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');
        starknet::eth::transfer_eth(self.owner.read(), amount);
    }

    #[external]
    fn setParams(ref self: ContractState, prize_wei: u256, fee_wei: u256, win_chance_ppm: u32) {
        assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');
        self.prize_wei.write(prize_wei);
        self.entry_fee_wei.write(fee_wei);
        self.win_chance_ppm.write(win_chance_ppm);
        self::Event::emit(ParamsUpdated { prize_wei, entry_fee_wei: fee_wei, win_chance_ppm });
    }
}
