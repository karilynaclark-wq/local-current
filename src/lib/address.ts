// Business addresses are stored as one string ("123 Main St, Chicago, IL 60601")
// because other code reads the zip from it and geocodes it for check-ins.
// The UI collects the parts separately; these helpers convert both ways.

export interface AddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export const EMPTY_ADDRESS: AddressParts = { street: '', city: '', state: '', zip: '' };

export function formatAddress({ street, city, state, zip }: AddressParts): string {
  const stateZip = [state.trim().toUpperCase(), zip.trim()].filter(Boolean).join(' ');
  return [street.trim(), city.trim(), stateZip].filter(Boolean).join(', ');
}

/** Best-effort split of a stored address back into parts for editing. */
export function parseAddress(address: string | null | undefined): AddressParts {
  if (!address) return { ...EMPTY_ADDRESS };
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const m = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m && parts.length >= 3) {
    return {
      street: parts.slice(0, -2).join(', '),
      city: parts[parts.length - 2],
      state: m[1].toUpperCase(),
      zip: m[2],
    };
  }
  // Unrecognized format: keep everything in street so nothing is lost.
  return { ...EMPTY_ADDRESS, street: address };
}

/** Returns an error message, or null if the address is complete and valid. */
export function validateAddress({ street, city, state, zip }: AddressParts): string | null {
  if (!street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
    return 'Please fill in street, city, state, and zip code.';
  }
  if (!/^[A-Za-z]{2}$/.test(state.trim())) return 'State should be the 2-letter abbreviation (e.g. IL).';
  if (!/^\d{5}$/.test(zip.trim())) return 'Zip code should be 5 digits.';
  return null;
}
