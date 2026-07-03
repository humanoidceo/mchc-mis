from decimal import Decimal, ROUND_HALF_UP
from datetime import date

from django.utils import timezone


MONEY_QUANT = Decimal('0.01')
AFGHAN_MONTHS = (
    'Hamal',
    'Sawr',
    'Jawza',
    'Saratan',
    'Asad',
    'Sonbola',
    'Mizan',
    'Aqrab',
    'Qaws',
    'Jadi',
    'Dalwa',
    'Hut',
)


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def calculate_afghanistan_salary_tax(monthly_taxable_salary: Decimal) -> Decimal:
    monthly_taxable_salary = money(monthly_taxable_salary)
    if monthly_taxable_salary <= Decimal('5000'):
        return Decimal('0.00')
    if monthly_taxable_salary <= Decimal('12500'):
        return money((monthly_taxable_salary - Decimal('5000')) * Decimal('0.02'))
    if monthly_taxable_salary <= Decimal('100000'):
        return money(Decimal('150') + (monthly_taxable_salary - Decimal('12500')) * Decimal('0.10'))
    return money(Decimal('8900') + (monthly_taxable_salary - Decimal('100000')) * Decimal('0.20'))


def gregorian_to_afghan_date(gregorian_date: date) -> tuple[int, int, int]:
    gy = gregorian_date.year
    gm = gregorian_date.month
    gd = gregorian_date.day
    g_day_in_month = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

    if gy > 1600:
        jy = 979
        gy -= 1600
    else:
        jy = 0
        gy -= 621

    gy2 = gy + 1 if gm > 2 else gy
    days = (
        365 * gy
        + (gy2 + 3) // 4
        - (gy2 + 99) // 100
        + (gy2 + 399) // 400
        - 80
        + gd
        + g_day_in_month[gm - 1]
    )

    jy += 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461

    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365

    if days < 186:
        jm = 1 + (days // 31)
        jd = 1 + (days % 31)
    else:
        jm = 7 + ((days - 186) // 30)
        jd = 1 + ((days - 186) % 30)

    return jy, jm, jd


def current_afghan_date() -> tuple[int, int, str, int]:
    today = timezone.localdate()
    year, month_index, day = gregorian_to_afghan_date(today)
    return year, month_index, AFGHAN_MONTHS[month_index - 1], day
