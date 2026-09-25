//! New York market clock, computed from a unix timestamp on-chain.
//! US daylight saving: from the second Sunday of March at 02:00 local (07:00 UTC)
//! to the first Sunday of November at 02:00 local (06:00 UTC).
//! Holidays and half-days are not modelled.

const DAY: i64 = 86_400;

/// Days since 1970-01-01 → (year, month, day). Howard Hinnant's civil_from_days.
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// (year, month, day) → days since 1970-01-01.
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 } as i64;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// 0 = Sunday … 6 = Saturday.
pub fn weekday(days: i64) -> i64 {
    (days + 4).rem_euclid(7)
}

/// nth Sunday (1-based) of a month, as days since epoch.
fn nth_sunday(y: i64, m: u32, n: i64) -> i64 {
    let first = days_from_civil(y, m, 1);
    let to_sunday = (7 - weekday(first)) % 7;
    first + to_sunday + 7 * (n - 1)
}

/// Offset of New York time from UTC at this instant, in seconds (-4h or -5h).
pub fn ny_offset(ts: i64) -> i64 {
    let (y, _, _) = civil_from_days(ts.div_euclid(DAY));
    let dst_start = nth_sunday(y, 3, 2) * DAY + 7 * 3600;
    let dst_end = nth_sunday(y, 11, 1) * DAY + 6 * 3600;
    if ts >= dst_start && ts < dst_end { -4 * 3600 } else { -5 * 3600 }
}

/// The regular-session close (16:00 New York) on the New York date containing `ts`,
/// or None on a weekend.
pub fn session_close(ts: i64) -> Option<i64> {
    let local = ts + ny_offset(ts);
    let local_day = local.div_euclid(DAY);
    let wd = weekday(local_day);
    if wd == 0 || wd == 6 {
        return None;
    }
    let close_local = local_day * DAY + 16 * 3600;
    // DST changes at 02:00, so the offset at 16:00 equals the offset at 12:00 that day.
    let offset = ny_offset(close_local - ny_offset(ts));
    Some(close_local - offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(y: i64, m: u32, d: u32, hh: i64, mm: i64) -> i64 {
        days_from_civil(y, m, d) * DAY + hh * 3600 + mm * 60
    }

    #[test]
    fn calendar_roundtrip() {
        for z in [-1000, 0, 19_000, 20_720, 25_000] {
            let (y, m, d) = civil_from_days(z);
            assert_eq!(days_from_civil(y, m, d), z);
        }
        assert_eq!(weekday(0), 4); // 1970-01-01 was a Thursday
        assert_eq!(weekday(days_from_civil(2026, 9, 25)), 5); // Friday
    }

    #[test]
    fn dst_boundaries_2026() {
        // DST 2026: starts Sun 8 Mar 07:00 UTC, ends Sun 1 Nov 06:00 UTC
        assert_eq!(ny_offset(ts(2026, 3, 8, 6, 59)), -5 * 3600);
        assert_eq!(ny_offset(ts(2026, 3, 8, 7, 0)), -4 * 3600);
        assert_eq!(ny_offset(ts(2026, 11, 1, 5, 59)), -4 * 3600);
        assert_eq!(ny_offset(ts(2026, 11, 1, 6, 0)), -5 * 3600);
    }

    #[test]
    fn close_times() {
        // Summer: 16:00 EDT = 20:00 UTC
        assert_eq!(session_close(ts(2026, 9, 25, 14, 0)), Some(ts(2026, 9, 25, 20, 0)));
        // Winter: 16:00 EST = 21:00 UTC
        assert_eq!(session_close(ts(2026, 12, 3, 15, 0)), Some(ts(2026, 12, 3, 21, 0)));
        // 01:30 UTC Friday is still Thursday evening in New York
        assert_eq!(session_close(ts(2026, 9, 25, 1, 30)), Some(ts(2026, 9, 24, 20, 0)));
        // Weekend: no session
        assert_eq!(session_close(ts(2026, 9, 26, 15, 0)), None);
        assert_eq!(session_close(ts(2026, 9, 27, 15, 0)), None);
        // Monday after DST ends: 21:00 UTC
        assert_eq!(session_close(ts(2026, 11, 2, 15, 0)), Some(ts(2026, 11, 2, 21, 0)));
    }
}
