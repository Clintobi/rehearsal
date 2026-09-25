use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Fill is worse than fair value by more than the tolerance")]
    FillWorseThanFair,
    #[msg("open_guard needs a matching close_guard later in the same transaction")]
    MissingClose,
    #[msg("Tolerance must be between 0 and 5000 bps")]
    BadTolerance,
    #[msg("Stablecoin leg is not an allowed stablecoin")]
    NotAStablecoin,
    #[msg("Token account does not belong to the signer or has the wrong mint")]
    WrongTokenAccount,
    #[msg("Pyth account is missing but the policy needs one")]
    MissingPriceAccount,
    #[msg("Account is not a Pyth PriceUpdateV2 owned by the Pyth receiver")]
    NotAPythAccount,
    #[msg("Pyth price is for a different feed")]
    WrongFeed,
    #[msg("Pyth update is only partially verified")]
    PartiallyVerified,
    #[msg("Pyth price is older than the policy allows")]
    StalePrice,
    #[msg("Pyth confidence interval is wider than the policy allows")]
    ConfidenceTooWide,
    #[msg("Oracle price is zero or negative")]
    BadPrice,
    #[msg("The swap did not spend any input")]
    NothingSpent,
    #[msg("The swap did not deliver any output")]
    NothingReceived,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Mint extension data is malformed")]
    BadMintData,
    #[msg("Circuit breaker: trading in this stock is paused or in a limit state")]
    TradingPaused,
    #[msg("The primary exchange has halted the underlying stock")]
    ExchangeHalted,
    #[msg("Circuit breaker has not been cranked recently; crank it in the same transaction")]
    BreakerStale,
    #[msg("Breaker parameters out of range")]
    BadBreakerParams,
    #[msg("Breaker is for a different feed than the guard policy")]
    WrongBreaker,
    #[msg("This order waits for a cross (open or close) and can't be filled directly")]
    CrossOnly,
    #[msg("Order has expired")]
    OrderExpired,
    #[msg("No cross is open for this stock right now")]
    CrossClosed,
    #[msg("Orders don't match (side, stock, stablecoin, feed or timing)")]
    WrongOrder,
    #[msg("Nothing to cross between these orders")]
    NothingToCross,
    #[msg("The zero-knowledge proof did not verify")]
    ProofInvalid,
}
