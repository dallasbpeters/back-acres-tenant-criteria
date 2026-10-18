import { amenityOptions, type AmenityId } from "@/lib/management/amenities";
import { Icon } from "@/components/ui/icon";

export function AmenityPicker({ selected = [] }: { selected?: AmenityId[] }) {
  return (
    <fieldset className="amenity-picker">
      <legend>Amenities</legend>
      <p className="small-note">
        Select the features included with this property.
      </p>
      <div className="amenity-options">
        {amenityOptions.map((option) => (
          <label key={option.id} className="amenity-option">
            <input
              type="checkbox"
              name="amenities"
              value={option.id}
              defaultChecked={selected.includes(option.id)}
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
    selected.includes(option.id),
  );
  if (!options.length) return null;
  return (
    <section
      id="property-amenities"
      className="property-content-section property-amenities"
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
