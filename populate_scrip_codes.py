"""
Populate IIFL ScripCode mapping table with common Indian stocks
Run this script to seed the database with ScripCode mappings
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.models.models import IIFLScripCode, Base
from app.core.config import settings

# Common IIFL ScripCodes for NSE stocks
IIFL_SCRIP_CODES = [
    # Large Cap Stocks
    {"symbol": "RELIANCE", "scrip_code": 2885, "company_name": "Reliance Industries Ltd", "lot_size": 1},
    {"symbol": "TCS", "scrip_code": 11536, "company_name": "Tata Consultancy Services Ltd", "lot_size": 1},
    {"symbol": "HDFCBANK", "scrip_code": 1363, "company_name": "HDFC Bank Ltd", "lot_size": 1},
    {"symbol": "INFY", "scrip_code": 408, "company_name": "Infosys Ltd", "lot_size": 1},
    {"symbol": "ICICIBANK", "scrip_code": 4963, "company_name": "ICICI Bank Ltd", "lot_size": 1},
    {"symbol": "SBIN", "scrip_code": 3045, "company_name": "State Bank of India", "lot_size": 1},
    {"symbol": "HDFC", "scrip_code": 1333, "company_name": "Housing Development Finance Corporation Ltd", "lot_size": 1},
    {"symbol": "ITC", "scrip_code": 424, "company_name": "ITC Ltd", "lot_size": 1},
    {"symbol": "BHARTIARTL", "scrip_code": 10604, "company_name": "Bharti Airtel Ltd", "lot_size": 1},
    {"symbol": "KOTAKBANK", "scrip_code": 1922, "company_name": "Kotak Mahindra Bank Ltd", "lot_size": 1},

    # Mid Cap Stocks
    {"symbol": "LT", "scrip_code": 11483, "company_name": "Larsen & Toubro Ltd", "lot_size": 1},
    {"symbol": "WIPRO", "scrip_code": 3787, "company_name": "Wipro Ltd", "lot_size": 1},
    {"symbol": "ASIANPAINT", "scrip_code": 15083, "company_name": "Asian Paints Ltd", "lot_size": 1},
    {"symbol": "MARUTI", "scrip_code": 10999, "company_name": "Maruti Suzuki India Ltd", "lot_size": 1},
    {"symbol": "BAJFINANCE", "scrip_code": 16675, "company_name": "Bajaj Finance Ltd", "lot_size": 1},
    {"symbol": "TECHM", "scrip_code": 13538, "company_name": "Tech Mahindra Ltd", "lot_size": 1},
    {"symbol": "SUNPHARMA", "scrip_code": 3351, "company_name": "Sun Pharmaceutical Industries Ltd", "lot_size": 1},
    {"symbol": "ULTRACEMCO", "scrip_code": 11532, "company_name": "UltraTech Cement Ltd", "lot_size": 1},
    {"symbol": "NESTLEIND", "scrip_code": 17963, "company_name": "Nestle India Ltd", "lot_size": 1},
    {"symbol": "POWERGRID", "scrip_code": 14977, "company_name": "Power Grid Corporation of India Ltd", "lot_size": 1},

    # Popular Trading Stocks
    {"symbol": "ADANIPORTS", "scrip_code": 15083, "company_name": "Adani Ports and Special Economic Zone Ltd", "lot_size": 1},
    {"symbol": "TATAMOTORS", "scrip_code": 884, "company_name": "Tata Motors Ltd", "lot_size": 1},
    {"symbol": "TATASTEEL", "scrip_code": 3499, "company_name": "Tata Steel Ltd", "lot_size": 1},
    {"symbol": "ONGC", "scrip_code": 2263, "company_name": "Oil and Natural Gas Corporation Ltd", "lot_size": 1},
    {"symbol": "NTPC", "scrip_code": 11630, "company_name": "NTPC Ltd", "lot_size": 1},
    {"symbol": "JSWSTEEL", "scrip_code": 11723, "company_name": "JSW Steel Ltd", "lot_size": 1},
    {"symbol": "GRASIM", "scrip_code": 1232, "company_name": "Grasim Industries Ltd", "lot_size": 1},
    {"symbol": "HINDALCO", "scrip_code": 1363, "company_name": "Hindalco Industries Ltd", "lot_size": 1},
    {"symbol": "DRREDDY", "scrip_code": 881, "company_name": "Dr. Reddy's Laboratories Ltd", "lot_size": 1},
    {"symbol": "COALINDIA", "scrip_code": 20374, "company_name": "Coal India Ltd", "lot_size": 1},

    # Banking & Finance
    {"symbol": "AXISBANK", "scrip_code": 5900, "company_name": "Axis Bank Ltd", "lot_size": 1},
    {"symbol": "INDUSINDBK", "scrip_code": 6915, "company_name": "IndusInd Bank Ltd", "lot_size": 1},
    {"symbol": "BAJAJFINSV", "scrip_code": 16669, "company_name": "Bajaj Finserv Ltd", "lot_size": 1},
    {"symbol": "HDFCLIFE", "scrip_code": 467, "company_name": "HDFC Life Insurance Company Ltd", "lot_size": 1},
    {"symbol": "SBILIFE", "scrip_code": 21808, "company_name": "SBI Life Insurance Company Ltd", "lot_size": 1},

    # IT Stocks
    {"symbol": "HCLTECH", "scrip_code": 7229, "company_name": "HCL Technologies Ltd", "lot_size": 1},
    {"symbol": "MINDTREE", "scrip_code": 14356, "company_name": "Mindtree Ltd", "lot_size": 1},
    {"symbol": "LTTS", "scrip_code": 18564, "company_name": "L&T Technology Services Ltd", "lot_size": 1},

    # Consumer Goods
    {"symbol": "HINDUNILVR", "scrip_code": 1394, "company_name": "Hindustan Unilever Ltd", "lot_size": 1},
    {"symbol": "BRITANNIA", "scrip_code": 547, "company_name": "Britannia Industries Ltd", "lot_size": 1},
    {"symbol": "DABUR", "scrip_code": 1637, "company_name": "Dabur India Ltd", "lot_size": 1},

    # Pharma
    {"symbol": "CIPLA", "scrip_code": 739, "company_name": "Cipla Ltd", "lot_size": 1},
    {"symbol": "DIVISLAB", "scrip_code": 10940, "company_name": "Divi's Laboratories Ltd", "lot_size": 1},
    {"symbol": "LUPIN", "scrip_code": 10440, "company_name": "Lupin Ltd", "lot_size": 1},

    # Auto
    {"symbol": "BAJAJ-AUTO", "scrip_code": 16669, "company_name": "Bajaj Auto Ltd", "lot_size": 1},
    {"symbol": "HEROMOTOCO", "scrip_code": 1348, "company_name": "Hero MotoCorp Ltd", "lot_size": 1},
    {"symbol": "M&M", "scrip_code": 1637, "company_name": "Mahindra & Mahindra Ltd", "lot_size": 1},
]

async def populate_scrip_codes():
    """Populate the ScripCode table with common stocks"""

    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        try:
            print("🔥 Populating IIFL ScripCode mappings...")

            # Create records
            added_count = 0
            for scrip_data in IIFL_SCRIP_CODES:
                # Check if already exists
                existing = await session.get(IIFLScripCode, scrip_data["symbol"])
                if not existing:
                    scrip_record = IIFLScripCode(
                        symbol=scrip_data["symbol"],
                        scrip_code=scrip_data["scrip_code"],
                        exchange="N",  # NSE
                        exchange_type="C",  # Cash
                        company_name=scrip_data["company_name"],
                        lot_size=scrip_data["lot_size"],
                        tick_size=0.05,  # Standard tick size for most stocks
                        is_active=True
                    )
                    session.add(scrip_record)
                    added_count += 1
                    print(f"✅ Added {scrip_data['symbol']} -> {scrip_data['scrip_code']}")
                else:
                    print(f"⚠️ {scrip_data['symbol']} already exists")

            # Commit changes
            await session.commit()
            print(f"🎉 Successfully added {added_count} ScripCode mappings!")
            print("\n📊 Available symbols for trading:")
            for scrip_data in IIFL_SCRIP_CODES:
                print(f"   {scrip_data['symbol']} - {scrip_data['company_name']}")

        except Exception as e:
            await session.rollback()
            print(f"❌ Error populating ScripCodes: {e}")
            raise

        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(populate_scrip_codes())