import { Picker } from "@react-native-picker/picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { OnboardingContext } from "../../components/OnboardingContext";

const { width } = Dimensions.get("window");

export default function LastPeriod() {
  const router = useRouter();
  const { data, setData } = useContext(OnboardingContext);

  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();

  const [month, setMonth] = useState(currentMonth);
  const [day, setDay] = useState(currentDay);
  const [saving, setSaving] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true })
    ]).start();
  }, []);

  const months = [
    "იანვარი","თებერვალი","მარტი","აპრილი","მაისი","ივნისი",
    "ივლისი","აგვისტო","სექტემბერი","ოქტომბერი","ნოემბერი","დეკემბერი"
  ];

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const handleFinish = async () => {
    try {
      setSaving(true);

      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, month - 1, day);

      setData({
        ...data,
        last_period: startDate.toISOString()
      });

      router.replace("/auth/register");

    } catch (error) {
      console.log("Onboarding error:", error);
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={["#FFFFFF", "#FFF0F5", "#FFD6E7"]}
      style={styles.container}
    >
      <View style={styles.bgCircleTop} />
      <View style={styles.bgCircleBottom} />

      <Animated.View style={[styles.content,{opacity:fadeAnim,transform:[{translateY:slideAnim}]}]}>
        
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Text style={styles.emoji}>🩸</Text>
          </View>

          <Text style={styles.title}>ბოლოს როდის მოგივიდა?</Text>

          <Text style={styles.subtitle}>
            აირჩიე თვე და რიცხვი, რომ შენი პირველი კალენდარი ზუსტად ავაწყოთ.
          </Text>
        </View>

        <View style={styles.pickerRow}>
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>თვე</Text>

            <Picker
              style={styles.picker}
              itemStyle={styles.pickerItem} // აქ დაემატა სტილი
              selectedValue={month}
              onValueChange={(value)=>setMonth(value)}
              dropdownIconColor="#ff4d88"
            >
              {months.map((m,i)=>(
                <Picker.Item
                  key={i}
                  label={m}
                  value={i+1}
                  color={Platform.OS==='ios' ? '#ff4d88' : '#333'}
                />
              ))}
            </Picker>
          </View>

          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>რიცხვი</Text>

            <Picker
              style={styles.picker}
              itemStyle={styles.pickerItem} // აქ დაემატა სტილი
              selectedValue={day}
              onValueChange={(value)=>setDay(value)}
              dropdownIconColor="#ff4d88"
            >
              {days.map((d)=>(
                <Picker.Item
                  key={d}
                  label={d.toString()}
                  value={d}
                  color={Platform.OS==='ios' ? '#ff4d88' : '#333'}
                />
              ))}
            </Picker>
          </View>
        </View>

      </Animated.View>

      <Animated.View style={[styles.footer,{opacity:fadeAnim,transform:[{translateY:slideAnim}]}]}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleFinish}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color="#fff"/>
            : <Text style={styles.buttonText}>დასრულება 🎉</Text>
          }
        </TouchableOpacity>
      </Animated.View>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,justifyContent:"space-between",paddingTop:80,paddingBottom:50},

  bgCircleTop:{
    position:"absolute",
    width:width,
    height:width,
    borderRadius:width/2,
    backgroundColor:"#FFEAF2",
    top:-width*0.4,
    right:-width*0.3,
    opacity:0.7
  },

  bgCircleBottom:{
    position:"absolute",
    width:width*0.8,
    height:width*0.8,
    borderRadius:width/2,
    backgroundColor:"rgba(255,214,231,0.4)",
    bottom:-width*0.2,
    left:-width*0.3
  },

  content:{flex:1,alignItems:"center",zIndex:10,paddingHorizontal:30},

  header:{alignItems:"center",marginBottom:40},

  iconBox:{
    width:90,
    height:90,
    borderRadius:45,
    backgroundColor:"#fff",
    justifyContent:"center",
    alignItems:"center",
    marginBottom:25,
    elevation:10,
    shadowColor:"#ff4d88",
    shadowOpacity:0.2,
    shadowRadius:15,
    shadowOffset:{width:0,height:8}
  },

  emoji:{fontSize:42},

  title:{
    fontSize:30,
    fontWeight:"900",
    color:"#ff4d88",
    textAlign:"center",
    letterSpacing:0.5,
    marginBottom:12
  },

  subtitle:{
    fontSize:16,
    color:"#7A5C6A",
    textAlign:"center",
    lineHeight:24,
    fontWeight:"500"
  },

  pickerRow:{flexDirection:"row",width:"100%",justifyContent:"space-between"},

  pickerContainer:{
    width:"48%",
    backgroundColor:"#fff",
    borderRadius:24,
    paddingTop:15,
    paddingBottom:Platform.OS==='ios'?0:15,
    elevation:8,
    shadowColor:"#ff4d88",
    shadowOpacity:0.15,
    shadowRadius:20,
    shadowOffset:{width:0,height:10},
    borderWidth:2,
    borderColor:"#FFF0F5",
    overflow:"hidden"
  },

  pickerLabel:{
    textAlign:"center",
    fontSize:13,
    fontWeight:"700",
    color:"#aaa",
    textTransform:"uppercase",
    letterSpacing:1,
    marginBottom:Platform.OS==='ios'?-20:0
  },

  picker:{width:"100%"},

  // აქ არის დამატებული ბოლდის სტილი
  pickerItem: {
    fontWeight: "bold",
    fontSize: 20, // ოდნავ გავზარდე კიდეც, რომ კარგად გამოჩნდეს
  },

  footer:{width:"100%",zIndex:10,paddingHorizontal:30},

  button:{
    backgroundColor:"#ff4d88",
    paddingVertical:20,
    borderRadius:24,
    alignItems:"center",
    elevation:8,
    shadowColor:"#ff4d88",
    shadowOpacity:0.4,
    shadowRadius:15,
    shadowOffset:{width:0,height:8}
  },

  buttonText:{
    color:"#fff",
    fontSize:18,
    fontWeight:"800",
    letterSpacing:0.5
  }
});