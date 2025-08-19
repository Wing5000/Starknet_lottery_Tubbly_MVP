#[starknet::contract]
mod BlockInstantLottery {
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::get_block_info;
    use starknet::storage::Map;
    use core::integer::u256;

    const PPM: u32 = 1_000_000_u32;

    #[derive(Drop, starknet::Event)]
    struct Played { player: ContractAddress, paid: u256, block_number: u64 }

    #[derive(Drop, starknet::Event)]
    struct ResultEvt { player: ContractAddress, won: bool, prize_amount: u256 }

    #[derive(Drop, starknet::Event)]
    struct PrizePaid { to: ContractAddress, amount: u256 }

    #[derive(Drop, starknet::Event)]
    struct PrizePending { to: ContractAddress, amount: u256 }

    #[derive(Drop, starknet::Event)]
    struct Funded { from: ContractAddress, amount: u256 }

    #[derive(Drop, starknet::Event)]
    struct ParamsUpdated { prize_wei: u256, entry_fee_wei: u256, win_chance_ppm: u32 }

    #[derive(Drop, starknet::Event)]
    struct OwnershipTransferred { previous_owner: ContractAddress, new_owner: ContractAddress }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Played: Played,
        Result: ResultEvt,
        PrizePaid: PrizePaid,
        PrizePending: PrizePending,
        Funded: Funded,
        ParamsUpdated: ParamsUpdated,
        OwnershipTransferred: OwnershipTransferred,
    }

    #[storage]
    struct Storage {
        owner: ContractAddress,
        prize_wei: u256,
        entry_fee_wei: u256,
        win_chance_ppm: u32,
        last_played_block: Map<ContractAddress, u64>,
        pending_prizes: Map<ContractAddress, u256>,
        nonce: u128,
        bank: u256,
    }

    fn u256_zero() -> u256 { u256 { low: 0, high: 0 } }

    fn assert_owner(self: @ContractState) {
        let caller = get_caller_address();
        assert(caller == self.owner.read(), 'not owner');
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        let caller = get_caller_address();
        self.owner.write(caller);
        self.prize_wei.write(u256 { low: 100_000_000_000_000_u128, high: 0 });
        self.entry_fee_wei.write(u256_zero());
        self.win_chance_ppm.write(100_u32);
        self.nonce.write(0_u128);
        self.bank.write(u256_zero());
        self.emit(OwnershipTransferred { previous_owner: caller, new_owner: caller });
    }

    #[external(v0)]
    fn play(ref self: ContractState, user_salt: u128) -> bool {
        let caller = get_caller_address();
        let block = get_block_info();
        let last = self.last_played_block.read(caller);
        assert(last < block.block_number, 'already this block');
        self.last_played_block.write(caller, block.block_number);

        let fee = self.entry_fee_wei.read();
        self.emit(Played { player: caller, paid: fee, block_number: block.block_number });

        let nonce = self.nonce.read();
        let seed: u128 = (block.block_timestamp.into() * 1_464_025_635_123_456_789_u128) + user_salt + nonce;
        let roll_mod: u128 = seed % 1_000_000_u128;
        let win_ppm_u128: u128 = self.win_chance_ppm.read().into();
        let won: bool = roll_mod < win_ppm_u128;
        self.nonce.write(nonce + 1_u128);

        if won {
            let prize = self.prize_wei.read();
            let bank = self.bank.read();
            if bank >= prize {
                self.bank.write(bank - prize);
                self.emit(PrizePaid { to: caller, amount: prize });
            } else {
                let old = self.pending_prizes.read(caller);
                self.pending_prizes.write(caller, old + prize);
                self.emit(PrizePending { to: caller, amount: prize });
            }
        }

        let prize_amount = if won { self.prize_wei.read() } else { u256_zero() };
        self.emit(ResultEvt { player: caller, won, prize_amount });
        return won;
    }

    #[external(v0)]
    fn claim(ref self: ContractState) {
        let caller = get_caller_address();
        let amount = self.pending_prizes.read(caller);
        if amount == u256_zero() { return (); }
        let bank = self.bank.read();
        assert(bank >= amount, 'insufficient bank');
        self.pending_prizes.write(caller, u256_zero());
        self.bank.write(bank - amount);
        self.emit(PrizePaid { to: caller, amount });
    }

    #[external(v0)]
    fn fund(ref self: ContractState, amount: u256) {
        let caller = get_caller_address();
        assert(amount != u256_zero(), 'no value');
        let bank = self.bank.read();
        self.bank.write(bank + amount);
        self.emit(Funded { from: caller, amount });
    }

    // expose reads as externals (plugin nie wspiera #[view])
    #[external(v0)]
    fn can_play_now(ref self: ContractState, player: ContractAddress) -> bool {
        let block = get_block_info();
        let last = self.last_played_block.read(player);
        return last < block.block_number;
    }

    #[external(v0)]
    fn next_allowed_block(ref self: ContractState, player: ContractAddress) -> u64 {
        let block = get_block_info();
        let last = self.last_played_block.read(player);
        if last == 0_u64 { return block.block_number; } else { return last + 1_u64; }
    }

    #[external(v0)]
    fn contract_balance(ref self: ContractState) -> u256 {
        return self.bank.read();
    }

    // ===== ADMIN =====
    #[external(v0)]
    fn set_params(ref self: ContractState, prize_wei: u256, fee_wei: u256, win_chance_ppm: u32) {
        assert_owner(@self);
        assert(win_chance_ppm <= PPM, 'ppm>100%');
        self.prize_wei.write(prize_wei);
        self.entry_fee_wei.write(fee_wei);
        self.win_chance_ppm.write(win_chance_ppm);
        self.emit(ParamsUpdated { prize_wei, entry_fee_wei: fee_wei, win_chance_ppm });
    }

    #[external(v0)]
    fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
        assert_owner(@self);
        let prev = self.owner.read();
        self.owner.write(new_owner);
        self.emit(OwnershipTransferred { previous_owner: prev, new_owner });
    }

    #[external(v0)]
    fn owner_withdraw(ref self: ContractState, amount: u256) {
        assert_owner(@self);
        assert(amount != u256_zero(), 'zero');
        let bank = self.bank.read();
        assert(bank >= amount, 'insufficient');
        self.bank.write(bank - amount);
    }
}
