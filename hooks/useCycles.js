import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { calculateAverageCycle, calculateAveragePeriod } from '../utils/cyclePrediction';

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

      // "მოჩვენება" თარიღის დამუშავება
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

      const { error } = await supabase.from('cycles').insert([
        { 
          user_id: user.id, 
          start_date: dateString, 
          period_length: avgPeriod 
        }
      ]);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error("Error adding cycle:", error);
    }
  };

  const updateLastCycle = async (newPeriod, newCycle) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || rawCycles.length === 0) return;

      const lastCycle = rawCycles[rawCycles.length - 1];
      if (lastCycle.isProfileFallback) return;

      const { error } = await supabase
        .from("cycles")
        .update({
          period_length: Number(newPeriod),
          cycle_length: Number(newCycle)
        })
        .eq("id", lastCycle.id);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error("Update cycle error:", error);
    }
  };

  const deleteCycle = async (cycleObj) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!cycleObj.isProfileFallback && cycleObj.id !== 'profile_fallback') {
        const { error: deleteError } = await supabase
          .from('cycles')
          .delete()
          .eq('id', cycleObj.id);
        if (deleteError) throw deleteError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ last_period: null })
        .eq('id', user.id);

      if (profileError) throw profileError;
      await loadData();
    } catch (error) {
      console.error("Error deleting cycle:", error);
    }
  };

  const markedDates = useMemo(() => {
    let marks = {};
    if (!profile && rawCycles.length === 0) return {};

    // ლოგიკა: თუ ისტორია მცირეა (1 ჩანაწერი), პრიორიტეტი პროფილის პარამეტრებს ენიჭება
    const avgCycle = (rawCycles.length > 1 ? calculateAverageCycle(rawCycles) : null) || profile?.cycle_length || 28;
    const avgPeriod = (rawCycles.length > 1 ? calculateAveragePeriod(rawCycles) : null) || profile?.period_length || 5;
    
    const lastStart = rawCycles.length > 0 ? rawCycles[rawCycles.length-1].start_date : null;

    if (!lastStart) return {};

    const allCycles = [...rawCycles.map(c => ({...c, isPrediction: false}))];
    let nextStart = dayjs(lastStart);

    for (let i = 0; i < 6; i++) {
      nextStart = nextStart.add(avgCycle, 'day');
      allCycles.push({ 
        start_date: nextStart.format("YYYY-MM-DD"), 
        period_length: avgPeriod, 
        isPrediction: true 
      });
    }

    allCycles.forEach(cycle => {
      const start = dayjs(cycle.start_date);
      const isPred = cycle.isPrediction;

      // 1. ვხატავთ პერიოდის დღეებს (წითელი/ვარდისფერი)
      for (let i = 0; i < cycle.period_length; i++) {
        const date = start.add(i, 'day').format("YYYY-MM-DD");
        marks[date] = { 
          selected: true, 
          selectedColor: isPred ? '#ff4d8880' : '#ff4d88', // გამჭვირვალე თუ პროგნოზია
          startingDay: i === 0,
          endingDay: i === cycle.period_length - 1
        };
      }

      // 2. ვხატავთ ოვულაციას (ყვითელი)
      const ovulation = start.add(avgCycle - 14, 'day');
      const ovDateStr = ovulation.format("YYYY-MM-DD");
      // ვამოწმებთ, რომ წითელ დღეს არ გადაეწეროს
      if (!marks[ovDateStr]) {
         marks[ovDateStr] = { 
            selected: true, 
            selectedColor: isPred ? '#ffd16680' : '#ffd166' // გამჭვირვალე თუ პროგნოზია
         };
      }

      // 3. ვხატავთ ნაყოფიერ დღეებს (მწვანე) - ოვულაციამდე 5 დღე
      for (let i = 1; i <= 5; i++) {
        const fertileDate = ovulation.subtract(i, 'day').format("YYYY-MM-DD");
        // ვამოწმებთ, რომ წითელ დღეს არ გადაეწეროს
        if (!marks[fertileDate]) {
          marks[fertileDate] = { 
            selected: true, 
            selectedColor: isPred ? '#06d6a080' : '#06d6a0' // გამჭვირვალე თუ პროგნოზია
          };
        }
      }
    });
    
    return marks;
  }, [rawCycles, profile]);

  return { markedDates, loadData, addCycle, deleteCycle, updateLastCycle, rawCycles, loading };
};