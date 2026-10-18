import { Icon } from "@/components/ui/icon";
import { type AmenityId, amenityOptions } from "@/lib/management/amenities";

export function AmenityPicker({ selected = [] }: { selected?: AmenityId[] }) {
  return (
    <fieldset className="amenity-picker">
      <legend>Amenities</legend>
      <p className="small-note">
        Select the features included with this property.
      </p>
      <div className="amenity-options">
        {amenityOptions.map((option) => (
          <label className="amenity-option" key={option.id}>
            <input
              defaultChecked={selected.includes(option.id)}
              name="amenities"
              type="checkbox"
              value={option.id}
            />
            <Icon name={option.icon} size={24} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function PropertyAmenities({
  selected = [],
}: {
  selected?: AmenityId[];
}) {
  const options = amenityOptions.filter((option) =>
    selected.includes(option.id)
  );
  if (!options.length) {
    return null;
  }
  return (
    <section
      className="property-content-section property-amenities"
      id="property-amenities"
    >
      <h2>Amenities</h2>
      <ul>
        {options.map((option) => (
          <li key={option.id}>
            <Icon name={option.icon} size={26} />
            <span>{option.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
