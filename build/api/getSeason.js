// @flow

import moment from 'moment';
import { clientGet } from './iracingClient';

const trackTypeToCatId = {
  oval: 1,
  road: 2,
  dirt_oval: 3,
  dirt_road: 4,
};

const licenceGroupToMinlicenselevel = {
  5: 18,
  4: 12,
  3: 8,
  2: 4,
  1: 1,
};

type carType = { id: number, sku: number };
type trackType = { ids: number, pkgid: number };

export default async function getSeason(cars: Array<carType>, tracks: Array<trackType>) {
  const carMap = cars.reduce((carry, car) => ({
    ...carry,
    [car.id]: car,
  }), {});
  const trackMap = tracks.reduce((carry, track) => {
    const newMap = { ...carry };
    track.ids.forEach((id) => {
      newMap[id] = track;
    });
    return newMap;
  }, {});

  const carClassResponse = await clientGet('/data/carclass/get');
  const carClassMap = carClassResponse.data.reduce((carry, carClass) => ({
    ...carry,
    [carClass.car_class_id]: carClass,
  }), {});

  const licenseResponse = await clientGet('/data/lookup/licenses');
  const licenseMap = licenseResponse.data.reduce((carry, license) => ({
    ...carry,
    [license.license_group]: license,
  }), {});

  const seasonResponse = await clientGet('/data/series/seasons', { include_series: 1 });

  return seasonResponse.data.map((series) => {
    const carClasses = series.car_class_ids.map((carClassId) => carClassMap[carClassId]);
    const seriesCars = carClasses.reduce((carry, carClass) => {
      const carsInClass = carClass.cars_in_class.map((carInClass) => carMap[carInClass.car_id]);
      return [...carry, ...carsInClass];
    }, []);

    const weekLength = series.schedules[0]?.race_time_descriptors[0]?.day_offset?.length || 7;
    const lastWeek = [...series.schedules].pop();
    const end = moment(lastWeek.start_date).add({ days: weekLength });

    return {
      seriesid: series.series_id,
      seriesname: series.schedules.length ? series.schedules[0].series_name.trim() : series.season_name.trim(),
      start: series.start_date,
      end: end.toISOString(),
      tracks: series.schedules.map((week) => ({
        raceweek: week.race_week_num,
        config: week.track.config_name,
        name: week.track.config_name ? `${week.track.track_name} - ${week.track.config_name}` : week.track.track_name,
        pkgid: trackMap[week.track.track_id].pkgid,
        start: week.start_date,
        weekLength: week.race_time_descriptors[0]?.day_offset?.length,
        race_time_descriptors: week.race_time_descriptors,
        race_lap_limit: week.race_lap_limit,
        race_time_limit: week.race_time_limit,
      })),
      catid: trackTypeToCatId[series.track_types[0].track_type],
      isOfficial: series.official,
      licenceGroup: series.license_group,
      licenceGroupName: licenseMap[series.license_group].group_name,
      minlicenselevel: licenceGroupToMinlicenselevel[series.license_group],
      isFixedSetup: series.fixed_setup,
      carclasses: carClasses.map((carClass) => ({ shortname: carClass.short_name })),
      cars: seriesCars.map(({ sku }) => ({ sku })),
      seasonid: series.season_id,
    };
  });
}
