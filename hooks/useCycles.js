import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native'; // დავამატოთ Alert შეტყობინებისთვის

import { supabase } from '../services/supabase';
import { calculateAverageCycle, calculateAveragePeriod } from '../utils/cyclePrediction';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

export const useCycles = () => {
  const [rawCycles, setRawCycles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [cyclesRes, profileRes] = await Promise.all([
        supabase.from("cycles").select("*").eq("user_id", user.id).order("start_date", { ascending: true }),
        supabase.from("profiles").select("*").eq("id", user.id).single()
      ]);

      let fetchedCycles = cyclesRes.data || [];
      const profData = profileRes.data;

      if (fetchedCycles.length === 0 && profData?.last_period) {
        fetchedCycles = [{
          id: 'profile_fallback', 
          start_date: profData.last_period,
          period_length: profData.period_length || 5,
          isProfileFallback: true 
        }];
      }

      setRawCycles(fetchedCycles);
      setProfile(profData);
    } catch (error) {
      console.error("Data error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCycle = async (dateString) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const avgPeriod = profile?.period_length || calculateAveragePeriod(rawCycles) || 5;
      const formattedDate = dayjs(dateString).format("YYYY-MM-DD");

      const { error } = await supabase.from('cycles').insert([
        { 
          user_id: user.id, 
          start_date: formattedDate, 
          period_length: avgPeriod 
        }
      ]);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error("Error adding cycle:", error);
    }
  };

  const deleteCycle = async (cycleObj) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // რეალური ციკლის წაშლა
      if (!cycleObj.isProfileFallback && cycleObj.id !== 'profile_fallback') {
        const { error: deleteError } = await supabase
          .from('cycles')
          .delete()
          .eq('id', cycleObj.id);
        
        if (deleteError) throw deleteError;
      }

      // თუ ეს პროფილის ბოლო პერიოდია, მასაც ვასუფთავებთ
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ last_period: null })
        .eq('id', user.id);

      if (profileError) throw profileError;

      await loadData(); // მონაცემების განახლება
      Alert.alert("წარმატება", "მონაცემები წარმატებით წაიშალა ✨");
    } catch (error) {
      console.error("Error deleting cycle:", error);
      Alert.alert("შეცდომა", "წაშლა ვერ მოხერხდა.");
    }
  };

  const markedDates = useMemo(() => {
    let marks = {};
    if (!profile && rawCycles.length === 0) return {};

    const avgCycle = (rawCycles.length > 1 ? calculateAverageCycle(rawCycles) : null) || profile?.cycle_length || 28;
    const avgPeriod = (rawCycles.length > 1 ? calculateAveragePeriod(rawCycles) : null) || profile?.period_length || 5;
    
    const lastStart = rawCycles.length > 0 ? rawCycles[rawCycles.length-1].start_date : null;
    if (!lastStart) return {};

    const allCycles = [...rawCycles.map(c => ({...c, isPrediction: false}))];
    let nextStart = dayjs(lastStart, "YYYY-MM-DD");

    for (let i = 0; i < 6; i++) {
      nextStart = nextStart.add(avgCycle, 'day');
      allCycles.push({ 
        start_date: nextStart.format("YYYY-MM-DD"), 
        period_length: avgPeriod, 
        isPrediction: true 
      });
    }

    allCycles.forEach(cycle => {
      const start = dayjs(cycle.start_date, "YYYY-MM-DD");
      const isPred = cycle.isPrediction;

      for (let i = 0; i < cycle.period_length; i++) {
        const date = start.add(i, 'day').format("YYYY-MM-DD");
        marks[date] = { 
          selected: true, 
          selectedColor: isPred ? '#ff4d8880' : '#ff4d88',
          startingDay: i === 0,
          endingDay: i === cycle.period_length - 1
        };
      }

      const ovulation = start.add(avgCycle - 14, 'day');
      const ovDateStr = ovulation.format("YYYY-MM-DD");
      if (!marks[ovDateStr]) {
         marks[ovDateStr] = { 
            selected: true, 
            selectedColor: isPred ? '#ffd16680' : '#ffd166' 
         };
      }

      for (let i = 1; i <= 5; i++) {
        const fertileDate = ovulation.subtract(i, 'day').format("YYYY-MM-DD");
        if (!marks[fertileDate]) {
          marks[fertileDate] = { 
            selected: true, 
            selectedColor: isPred ? '#06d6a080' : '#06d6a0' 
          };
        }
      }
    });
    
    return marks;
  }, [rawCycles, profile]);

  return { markedDates, loadData, addCycle, deleteCycle, rawCycles, loading };
};