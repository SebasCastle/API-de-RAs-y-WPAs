export interface RA {
  error: boolean;
  rentalData: RentalData;
  rental: boolean;
  vehicleExchangeMB: VehicleExchangeMB;
  req: Req;
  qvData: qvData;
}

export interface RentalData {
  totalChargesRateAmt: string;
  outString: string;
  mva: string;
  checkOutStation: string;
  checkOutStationMnemonic: string;
  checkInStationMnemonic: string;
  checkInStation: string;
  checkInDate: string;
  checkOutDate: string;
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
  rentalDiscountAmt: string;
  // totalChargesRateAmt: string;
  amtDueRateAmt: string;
  rentingStationMnemonic: string;
  checkOutStationCountry: string;
  ldwNotProvidedInd: string;
  awdMilesCheck: boolean;
  rentalStatus: string;
}

export interface Req {
  raNo: string;
}

export interface qvData {
  qvDiEstTotal: string;
  qvDiEstTotalClosed: string;
}

export interface VehicleExchangeMB {
  currentVehicle: CurrentVehicle;
}

export interface CurrentVehicle {
  mva: string;
}
