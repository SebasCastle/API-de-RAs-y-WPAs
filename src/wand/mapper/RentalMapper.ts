import { RA } from "../interface/ra.interface";
import { RentalResponse } from "../interface/rental-response.interface";

export class RentalMapper {
  static toDomain(rental: RentalResponse): RA {
    return {
      error: rental.error,

      rental: rental.rental,

      rentalData: {
        mva: rental.rentalData.mva,

        checkOutStation: rental.rentalData.checkOutStation,

        checkOutStationMnemonic: rental.rentalData.checkOutStationMnemonic,

        checkInStationMnemonic: rental.rentalData.checkInStationMnemonic,

        checkInStation: rental.rentalData.checkInStation,

        checkInDate: rental.rentalData.checkInDate,

        checkOutDate: rental.rentalData.checkOutDate,

        checkOutTime: rental.rentalData.checkOutTime,

        checkInTime: rental.rentalData.checkInTime,

        coverages: rental.rentalData.coverages,

        ldw: rental.rentalData.ldw,

        pai: rental.rentalData.pai,

        pep: rental.rentalData.pep,

        ali: rental.rentalData.ali,

        raNum: rental.rentalData.raNum,

        resNum: rental.rentalData.resNum,

        // outString: rental.rentalData.outString,

        totalChargesRateAmt: rental.rentalData.totalChargesRateAmt,

        outString: RentalMapper.BuscarNetCharges(rental.rentalData.outString),

        vehicleExchange: rental.rentalData.vehicleExchange,

        aliRateAmt: rental.rentalData.aliRateAmt,

        ldwRateAmt: rental.rentalData.ldwRateAmt,

        paiRateAmt: rental.rentalData.paiRateAmt,

        pepRateAmt: rental.rentalData.pepRateAmt,

        rentalDiscountAmt: rental.rentalData.rentalDiscountAmt,

        amtDueRateAmt: rental.rentalData.amtDueRateAmt,

        rentingStationMnemonic: rental.rentalData.rentingStationMnemonic,

        checkOutStationCountry: rental.rentalData.checkOutStationCountry,

        ldwNotProvidedInd: rental.rentalData.ldwNotProvidedInd,

        awdMilesCheck: rental.rentalData.awdMilesCheck,
      },

      qvData: {
        qvDiEstTotal: RentalMapper.money(rental.qvData.qvDiEstTotal),
        qvDiEstTotalClosed: RentalMapper.money(
          rental.qvData.qvDiEstTotalClosed,
        ),
      },

      req: {
        raNo: rental.req.raNo,
      },

      vehicleExchangeMB: {
        currentVehicle: {
          mva: rental.vehicleExchangeMB.currentVehicle.mva,
        },
      },
    };
  }

  private static money(value: string | null | undefined): string {
    if (!value) return "0";

    return String(
      value

        .replace(/[A-Z]/g, "")

        .replace(/,/g, "")

        .trim(),
    );
  }

  private static BuscarNetCharges(outString: string | undefined): string {
    if (!outString) return "0.00";

    const regex = /NET\s+CHARGES\s*([\d,]+\.\d{2})/i;
    const match = outString.match(regex);

    return match ? match[1].replace(/,/g, "") : "0.00";
  }
}
