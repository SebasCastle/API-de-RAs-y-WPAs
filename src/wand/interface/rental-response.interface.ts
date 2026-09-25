export interface RentalResponse {
  error: boolean;
  rental: boolean;

  rentalData: {
    mva: string;

    checkOutStation: string;
    checkOutStationMnemonic: string;

    checkInStation: string;
    checkInStationMnemonic: string;

    checkOutDate: string;
    checkInDate: string;

    checkOutTime: string;
    checkInTime: string;

    coverages: string;

    ldw: string;
    pai: string;
    pep: string;
    ali: string;

    raNum: string;
    resNum: string;

    vehicleExchange: boolean;

    aliRateAmt: string;
    ldwRateAmt: string;
    paiRateAmt: string;
    pepRateAmt: string;

    totalChargesRateAmt: string;
    rentalDiscountAmt: string;
    amtDueRateAmt: string;

    rentingStationMnemonic: string;
    checkOutStationCountry: string;

    ldwNotProvidedInd: string;
    awdMilesCheck: boolean;
    outString: string;

    rentalStatus: string;
  };

  qvData: {
    qvDiEstTotal: string;
    qvDiEstTotalClosed: string;
  };

  req: {
    raNo: string;
  };

  vehicleExchangeMB: {
    currentVehicle: {
      mva: string;
    };
  };
}
